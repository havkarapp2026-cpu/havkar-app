#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DB="havkar_owner_review"
LOG="${1:-/opt/cursor/artifacts/owner-security-tests.log}"
mkdir -p "$(dirname "$LOG")"
: >"$LOG"
PASS="$(openssl rand -hex 24)"
export PGPASSWORD="$PASS"

restore_service_role() {
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "ALTER ROLE service_role NOBYPASSRLS;" >/dev/null
}

cleanup() {
  local status=$?
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "DROP DATABASE IF EXISTS ${DB};" >/dev/null || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "DROP ROLE IF EXISTS havkar_migrator;" >/dev/null || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "DROP ROLE IF EXISTS plain_owner;" >/dev/null || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "DROP ROLE IF EXISTS bypass_owner;" >/dev/null || true
  restore_service_role || true
  exit "$status"
}
trap cleanup EXIT

sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
DROP DATABASE IF EXISTS ${DB};
DROP ROLE IF EXISTS havkar_migrator;
CREATE ROLE havkar_migrator LOGIN PASSWORD '${PASS}' NOSUPERUSER BYPASSRLS;
ALTER ROLE service_role BYPASSRLS;
CREATE DATABASE ${DB} OWNER havkar_migrator;
SQL

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO havkar_migrator, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO havkar_migrator;
ALTER ROLE havkar_migrator SET search_path = public;
GRANT authenticated, service_role, anon TO havkar_migrator;
SQL

{
  echo "=== force rls experiment ==="
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DROP ROLE IF EXISTS plain_owner;
DROP ROLE IF EXISTS bypass_owner;
CREATE ROLE plain_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE bypass_owner NOLOGIN NOSUPERUSER BYPASSRLS;
CREATE SCHEMA force_demo AUTHORIZATION plain_owner;
GRANT plain_owner TO postgres;
SET ROLE plain_owner;
CREATE TABLE force_demo.secret (id integer);
ALTER TABLE force_demo.secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE force_demo.secret FORCE ROW LEVEL SECURITY;
CREATE FUNCTION force_demo.read_secret()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM force_demo.secret LIMIT 1;
$$;
RESET ROLE;
INSERT INTO force_demo.secret (id) VALUES (1);
SQL
} >>"$LOG"

# The insert above runs as postgres superuser after RESET ROLE, so it succeeds.
# The plain owner function must still see no row.
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 >>"$LOG" <<'SQL'
DO $$
DECLARE
  plain_result integer;
  bypass_result integer;
BEGIN
  EXECUTE 'SET ROLE plain_owner';
  SELECT force_demo.read_secret() INTO plain_result;
  EXECUTE 'RESET ROLE';
  IF plain_result IS NOT NULL THEN
    RAISE EXCEPTION 'force rls did not hide the row from a non-bypass security definer owner';
  END IF;

  ALTER TABLE force_demo.secret OWNER TO bypass_owner;
  ALTER FUNCTION force_demo.read_secret() OWNER TO bypass_owner;
  GRANT USAGE ON SCHEMA force_demo TO bypass_owner;
  EXECUTE 'SET ROLE bypass_owner';
  SELECT force_demo.read_secret() INTO bypass_result;
  EXECUTE 'RESET ROLE';
  IF bypass_result IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'bypassrls security definer owner could not read through force rls';
  END IF;
END $$;
SELECT 'FORCE_RLS_BYPASS_CONFIRMED' AS result;
SQL

psql_migrator() {
  psql "host=127.0.0.1 dbname=${DB} user=havkar_migrator" -v ON_ERROR_STOP=1 "$@"
}

psql_migrator -f "$ROOT/owner-security-harness.sql" >>"$LOG"
psql_migrator -f "$ROOT/owner-security-precheck.sql" >>"$LOG"
psql_migrator -f "$ROOT/../migrations/20261014224500_owner_identity.sql" >>"$LOG"
psql_migrator -f "$ROOT/owner-security-tests.sql" >>"$LOG"
psql_migrator -f "$ROOT/owner-recovery-procedure.sql" >>"$LOG"

echo "=== service role bypass still cannot write owner ===" >>"$LOG"
psql_migrator -v ON_ERROR_STOP=1 >>"$LOG" <<'SQL'
GRANT INSERT ON havkar_private.owner_identity TO service_role;
DO $$
BEGIN
  EXECUTE 'SET ROLE service_role';
  BEGIN
    INSERT INTO havkar_private.owner_identity (
      user_id, role_generation, phrase_hash, recovery_code_hash
    ) VALUES (
      '55555555-5555-4555-8555-555555555555', 9, 'x', 'y'
    );
    RAISE EXCEPTION 'bypass role inserted an owner';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;
REVOKE INSERT ON havkar_private.owner_identity FROM service_role;
SELECT 'SERVICE_ROLE_BYPASS_INSERT_BLOCKED' AS result;
SQL

echo "=== transfer race ===" >>"$LOG"
psql_migrator -v ON_ERROR_STOP=1 >>"$LOG" <<'SQL'
SELECT set_config(
  'havkar.test_uid',
  '11111111-1111-4111-8111-111111111111',
  false
);
SELECT set_config(
  'havkar.test_jwt',
  pg_catalog.jsonb_build_object(
    'session_id', '99999999-9999-4999-8999-999999999999',
    'app_metadata', pg_catalog.jsonb_build_object(
      'role', 'owner',
      'role_generation', owner_row.role_generation
    )
  )::text,
  false
)
FROM havkar_private.owner_identity owner_row;
SELECT havkar_private.arm_ownership_transfer(
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  'owner-phrase-local-2',
  (SELECT role_generation FROM havkar_private.owner_identity)
) AS race_arm;
SQL

HOLDER_LOG="$(mktemp)"
LOSER_LOG="$(mktemp)"
psql_migrator -v ON_ERROR_STOP=1 >"$HOLDER_LOG" <<'SQL' &
BEGIN;
SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config(
  'havkar.test_jwt',
  (
    SELECT pg_catalog.jsonb_build_object(
      'session_id', '99999999-9999-4999-8999-999999999999',
      'app_metadata', pg_catalog.jsonb_build_object(
        'role', 'owner',
        'role_generation', role_generation
      )
    )::text
    FROM havkar_private.owner_identity
  ),
  false
);
SELECT user_id FROM havkar_private.owner_identity FOR UPDATE;
SELECT pg_sleep(3);
SELECT havkar_private.commit_ownership_transfer(
  (SELECT arm_id FROM havkar_private.owner_transfer_arm),
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  'owner-phrase-local-2',
  (SELECT expected_generation FROM havkar_private.owner_transfer_arm)
);
COMMIT;
SQL
HOLDER_PID=$!
sleep 0.4
set +e
psql_migrator -v ON_ERROR_STOP=1 >"$LOSER_LOG" <<'SQL'
SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config(
  'havkar.test_jwt',
  (
    SELECT pg_catalog.jsonb_build_object(
      'session_id', '99999999-9999-4999-8999-999999999999',
      'app_metadata', pg_catalog.jsonb_build_object(
        'role', 'owner',
        'role_generation', role_generation
      )
    )::text
    FROM havkar_private.owner_identity
  ),
  false
);
SELECT havkar_private.commit_ownership_transfer(
  (SELECT arm_id FROM havkar_private.owner_transfer_arm),
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  'owner-phrase-local-2',
  (SELECT expected_generation FROM havkar_private.owner_transfer_arm)
);
SQL
LOSER_STATUS=$?
set -e
wait "$HOLDER_PID"
cat "$HOLDER_LOG" >>"$LOG"
echo "loser_status=${LOSER_STATUS}" >>"$LOG"
cat "$LOSER_LOG" >>"$LOG"
if [[ "$LOSER_STATUS" -eq 0 ]]; then
  echo "race loser unexpectedly committed" >>"$LOG"
  exit 1
fi
psql_migrator -v ON_ERROR_STOP=1 >>"$LOG" <<'SQL'
SELECT count(*) AS owner_rows, min(user_id::text) AS owner_id
FROM havkar_private.owner_identity;
SELECT count(*) AS consumed_arms FROM havkar_private.consumed_arms;
SELECT 'TRANSFER_RACE_ONE_WINNER' AS result;
SQL

node "$ROOT/delete-account-owner-gap.test.mjs" >>"$LOG"
echo "LOCAL_OWNER_SECURITY_TESTS_PASSED" >>"$LOG"
