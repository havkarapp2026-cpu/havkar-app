#!/usr/bin/env bash
# Controlled HAVKAR AI production migration.
# Applies the 9 approved SQL files, the 10th privilege revoke,
# and the 11th global spend-limit requirement.
# Each step runs in its own transaction and records migration history
# in that same transaction. The first error stops the script.
#
# This script does not deploy functions, activate billing, or create a backup.
# Production execution requires a separate owner approval and:
#   HAVKAR_MIGRATION_TARGET=production
#   HAVKAR_MIGRATION_CONFIRM=execute-approved-ai-release
#   HAVKAR_MIGRATION_APPLY=1
#   HAVKAR_PGHOST=aws-0-eu-west-1.pooler.supabase.com
#   HAVKAR_PGPORT=5432
#   HAVKAR_PGUSER=postgres.gispovnciifgikvgpzck
#   HAVKAR_PGDATABASE=postgres
#   HAVKAR_PGPASSWORD set in the environment, never printed
#   PGSSLMODE=require
#
# Isolated rehearsal uses a Docker database and never the production confirm string:
#   HAVKAR_MIGRATION_TARGET=isolated-rehearsal
#   HAVKAR_DOCKER_CONTAINER=<container>
#   HAVKAR_PGDATABASE=<database>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${HAVKAR_BACKUP_DIR:-/var/backups/havkar}"
SNAPSHOT="${HAVKAR_MIGRATION_SNAPSHOT:-/tmp/havkar-ai-migration-preflight.txt}"

STEPS=(
  "20261017160000|ai_attachments|supabase/migrations/20261017160000_ai_attachments.sql|9e147bc2eff4743448264b4ebf4409657e90a1062b2f09f566fcc2fabf9ec760"
  "20261017223000|ai_history_images_plans|supabase/migrations/20261017223000_ai_history_images_plans.sql|ad4fb0c4e497b12d5d5943e98ad89cd9812edd4ad86bab6d1e09b505eb549aad"
  "20261018034000|ai_business_plan_quotas|supabase/migrations/20261018034000_ai_business_plan_quotas.sql|b7979f9902fbcea41cb6dc1203ab25829af245de6bffd78cf7a34afc550078fc"
  "20261018114000|ai_revoke_maintain|supabase/migrations/20261018114000_ai_revoke_maintain.sql|3c882f6f49bf2c8982565b4aee7a89ee0f85aead9a713791f1484ae5a4231154"
  "20261018120000|ai_privilege_hardening|supabase/migrations/20261018120000_ai_privilege_hardening.sql|132ea6f45811a5684b3a72d7bf6f816e1e391e2ad0bbbcf026d861ed9b2aa355"
  "20261018180000|ai_gemini_cost_protection|supabase/migrations/20261018180000_ai_gemini_cost_protection.sql|14da1ccc161a03f793d19a104386e1cef34e3c47b1b048c67c2cceb16b0927af"
  "20261018220000|ai_spend_input_hold|supabase/migrations/20261018220000_ai_spend_input_hold.sql|3a3f6a76d6e132a1e2ec7dd2466f19dbb4bf44e4d1022450cea74df432ce0691"
  "20261018233000|ai_image_unitemized_ceiling|supabase/migrations/20261018233000_ai_image_unitemized_ceiling.sql|a5d131a832551695341da1d34eaba5ce0023c9ccc065a7a72e229bb13a9bbb35"
  "20261018234000|ai_attachment_inspection|supabase/migrations/20261018234000_ai_attachment_inspection.sql|849bdfc932591ac6c23421d2e51e4a66d43986c7d9c1c78e33da6f18247968b6"
  "20261019190000|ai_client_privilege_revoke|supabase/migrations/20261019190000_ai_client_privilege_revoke.sql|175cfe8906a8165e391d601001b6f15deef634185a2014249b68aaac2f51e06a"
  "20261019201000|ai_global_spend_limit_required|supabase/migrations/20261019201000_ai_global_spend_limit_required.sql|254ebd3acaaaf5204b7d296b71506f970bf16f72f8fd7bacbde770e6b62563e4"
)

die() {
  echo "MIGRATION_STOP $*" >&2
  exit 1
}

run_sql() {
  local mode="$1"
  if [[ -n "${HAVKAR_DOCKER_CONTAINER:-}" ]]; then
    local db="${HAVKAR_PGDATABASE:-postgres}"
    [[ "$HAVKAR_DOCKER_CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]] || die "unsafe container name"
    [[ "$db" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "unsafe database name"
    local extra="-At"
    if [[ "$mode" == "apply" ]]; then
      extra="--single-transaction"
    fi
    sudo docker exec -i "$HAVKAR_DOCKER_CONTAINER" \
      sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -v ON_ERROR_STOP=1 ${extra} -U supabase_admin -d ${db} -f -"
    return
  fi
  : "${HAVKAR_PGPASSWORD:?}"
  : "${HAVKAR_PGHOST:?}"
  : "${HAVKAR_PGPORT:?}"
  : "${HAVKAR_PGUSER:?}"
  : "${HAVKAR_PGDATABASE:?}"
  local flags=(-v ON_ERROR_STOP=1)
  if [[ "$mode" == "apply" ]]; then
    flags+=(--single-transaction)
  else
    flags+=(-At)
  fi
  PGPASSWORD="$HAVKAR_PGPASSWORD" PGSSLMODE=require psql \
    "host=${HAVKAR_PGHOST} port=${HAVKAR_PGPORT} user=${HAVKAR_PGUSER} dbname=${HAVKAR_PGDATABASE} sslmode=require" \
    "${flags[@]}" -f -
}

require_target() {
  case "${HAVKAR_MIGRATION_TARGET:-}" in
    isolated-rehearsal)
      [[ -n "${HAVKAR_DOCKER_CONTAINER:-}" ]] || die "isolated rehearsal needs HAVKAR_DOCKER_CONTAINER"
      ;;
    production)
      [[ -z "${HAVKAR_DOCKER_CONTAINER:-}" ]] || die "production refuses a docker target"
      [[ "${HAVKAR_MIGRATION_CONFIRM:-}" == "execute-approved-ai-release" ]] || die "production confirmation missing"
      [[ "${HAVKAR_PGHOST:-}" == "aws-0-eu-west-1.pooler.supabase.com" ]] || die "unexpected production host"
      [[ "${HAVKAR_PGPORT:-}" == "5432" ]] || die "production port must be 5432"
      [[ "${HAVKAR_PGUSER:-}" == "postgres.gispovnciifgikvgpzck" ]] || die "unexpected production user"
      [[ "${HAVKAR_PGDATABASE:-}" == "postgres" ]] || die "unexpected production database"
      [[ "${HAVKAR_PGHOST}" != *"keglioewbkgdabsizvys"* ]] || die "staging target refused"
      ;;
    *)
      die "set HAVKAR_MIGRATION_TARGET to isolated-rehearsal or production"
      ;;
  esac
}

check_hashes() {
  local entry version name file expected actual
  for entry in "${STEPS[@]}"; do
    IFS='|' read -r version name file expected <<<"$entry"
    [[ -f "$ROOT/$file" ]] || die "missing $file"
    actual="$(sha256sum "$ROOT/$file" | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || die "hash mismatch $file"
    if grep -F -q '$havkar_migration_body$' "$ROOT/$file"; then
      die "history delimiter found in $file"
    fi
  done
  echo "HASHES_OK 11"
}

check_backup() {
  local stamp dump roles storage
  [[ -f "$BACKUP_DIR/latest-stamp" ]] || die "backup stamp missing"
  stamp="$(tr -d '[:space:]' <"$BACKUP_DIR/latest-stamp")"
  [[ "$stamp" == "20261019T192303Z" ]] || die "backup stamp is not 20261019T192303Z"
  dump="$(sha256sum "$BACKUP_DIR/havkar-postgres-${stamp}.dump.gpg" | awk '{print $1}')"
  roles="$(sha256sum "$BACKUP_DIR/havkar-roles-${stamp}.sql.gpg" | awk '{print $1}')"
  storage="$(sha256sum "$BACKUP_DIR/havkar-storage-${stamp}.jpg.gpg" | awk '{print $1}')"
  [[ "$dump" == "28236919fd7919a1c4e20774d7968033e44ddbc66a6f538327810621f5ccc069" ]] || die "database backup hash mismatch"
  [[ "$roles" == "96e30bb962d0510098f37a06251084de9e25fa36ab1454e751f89dc859058437" ]] || die "roles backup hash mismatch"
  [[ "$storage" == "91a817f4d4b5387800b63948fd0390e64f516d1ff829a103a0f36aa794c3b52d" ]] || die "storage backup hash mismatch"
  echo "BACKUP_OK $stamp"
}

preflight() {
  run_sql read <<'SQL' | tee "$SNAPSHOT"
BEGIN READ ONLY;
SELECT 'migrations|' || count(*) FROM supabase_migrations.schema_migrations;
SELECT 'latest|' || version || '|' || name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 1;
SELECT 'ai_messages|' || (to_regclass('public.ai_messages') IS NULL);
SELECT 'ai_conversations|' || (to_regclass('public.ai_conversations') IS NULL);
SELECT 'ai_subscriptions|' || (to_regclass('public.ai_subscriptions') IS NULL);
SELECT 'ai_generated_files|' || (to_regclass('public.ai_generated_files') IS NULL);
SELECT 'ai_file_reviews|' || (to_regclass('public.ai_file_reviews') IS NULL);
SELECT 'users|' || count(*) FROM auth.users;
SELECT 'profiles|' || count(*) FROM public.profiles;
SELECT 'ads|' || count(*) FROM public.ads;
SELECT 'jobs|' || count(*) FROM public.jobs;
SELECT 'wallets|' || count(*) FROM public.wallets;
SELECT 'policies|' || count(*) FROM pg_policy;
SELECT 'storage_objects|' || count(*) FROM storage.objects;
SELECT 'storage_buckets|' || count(*) FROM storage.buckets;
SELECT 'budget_args|' || pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'consume_ai_budget';
SELECT 'pending|' || count(*)
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261017160000','20261017223000','20261018034000','20261018114000','20261018120000',
  '20261018180000','20261018220000','20261018233000','20261018234000','20261019190000',
  '20261019201000'
);
ROLLBACK;
SQL
  grep -qx 'migrations|25' "$SNAPSHOT" || die "migration count is not 25"
  grep -qx 'latest|20261014204305|service_provider_public_stats_invoker' "$SNAPSHOT" || die "latest migration changed"
  grep -qx 'ai_messages|true' "$SNAPSHOT" || die "ai_messages already exists"
  grep -qx 'ai_conversations|true' "$SNAPSHOT" || die "ai_conversations already exists"
  grep -qx 'ai_subscriptions|true' "$SNAPSHOT" || die "ai_subscriptions already exists"
  grep -qx 'ai_generated_files|true' "$SNAPSHOT" || die "ai_generated_files already exists"
  grep -qx 'ai_file_reviews|true' "$SNAPSHOT" || die "ai_file_reviews already exists"
  grep -qx 'users|3' "$SNAPSHOT" || die "user count differs from the approved backup baseline"
  grep -qx 'profiles|3' "$SNAPSHOT" || die "profile count differs from the approved backup baseline"
  grep -qx 'ads|8' "$SNAPSHOT" || die "ad count differs from the approved backup baseline"
  grep -qx 'jobs|1' "$SNAPSHOT" || die "job count differs from the approved backup baseline"
  grep -qx 'wallets|3' "$SNAPSHOT" || die "wallet count differs from the approved backup baseline"
  grep -qx 'policies|165' "$SNAPSHOT" || die "policy count differs from the approved backup baseline"
  grep -qx 'storage_objects|1' "$SNAPSHOT" || die "storage object count differs from the approved backup baseline"
  grep -qx 'storage_buckets|5' "$SNAPSHOT" || die "storage bucket count differs from the approved backup baseline"
  grep -qx 'budget_args|p_user_id uuid, p_characters integer' "$SNAPSHOT" || die "consume_ai_budget signature changed"
  grep -qx 'pending|0' "$SNAPSHOT" || die "one or more AI migration versions are already recorded"
  echo "PREFLIGHT_OK"
}

apply_step() {
  local version="$1" name="$2" file="$3"
  echo "STEP_BEGIN $version $name"
  {
    printf '\\set ON_ERROR_STOP on\n'
    cat "$ROOT/$file"
    printf '\nINSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)\nVALUES (\n'
    printf "  '%s',\n" "$version"
    printf "  '%s',\n" "$name"
    printf '  ARRAY[\n$havkar_migration_body$\n'
    cat "$ROOT/$file"
    printf '\n$havkar_migration_body$],\n  current_user\n);\n'
  } | run_sql apply || die "step ${version} failed; earlier committed steps were kept; do not rerun the full sequence blindly"
  echo "STEP_OK $version"
}

postcheck() {
  local result
  result="$(run_sql read <<'SQL'
BEGIN READ ONLY;
SELECT 'migrations|' || count(*) FROM supabase_migrations.schema_migrations;
SELECT 'latest|' || version || '|' || name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 1;
SELECT 'recorded|' || count(*)
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261017160000','20261017223000','20261018034000','20261018114000','20261018120000',
  '20261018180000','20261018220000','20261018233000','20261018234000','20261019190000',
  '20261019201000'
) AND statements IS NOT NULL AND name IS NOT NULL;
SELECT 'users|' || count(*) FROM auth.users;
SELECT 'profiles|' || count(*) FROM public.profiles;
SELECT 'ads|' || count(*) FROM public.ads;
SELECT 'jobs|' || count(*) FROM public.jobs;
SELECT 'wallets|' || count(*) FROM public.wallets;
SELECT 'policies|' || count(*) FROM pg_policy;
SELECT 'storage_objects|' || count(*) FROM storage.objects;
SELECT 'storage_buckets|' || count(*) FROM storage.buckets;
SELECT 'ai_rows|' ||
  (SELECT count(*) FROM public.ai_messages) || '|' ||
  (SELECT count(*) FROM public.ai_conversations) || '|' ||
  (SELECT count(*) FROM public.ai_subscriptions) || '|' ||
  (SELECT count(*) FROM public.ai_generated_files) || '|' ||
  (SELECT count(*) FROM public.ai_file_reviews);
SELECT 'rls|' || c.relname || '|' || c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ai_messages','ai_subscriptions','ai_generated_files')
ORDER BY c.relname;
SELECT 'priv_messages|' ||
  has_table_privilege('authenticated','public.ai_messages','SELECT') || '|' ||
  has_table_privilege('authenticated','public.ai_messages','INSERT') || '|' ||
  has_table_privilege('authenticated','public.ai_messages','UPDATE') || '|' ||
  has_table_privilege('authenticated','public.ai_messages','DELETE') || '|' ||
  has_table_privilege('anon','public.ai_messages','SELECT');
SELECT 'priv_subscriptions|' ||
  has_table_privilege('authenticated','public.ai_subscriptions','SELECT') || '|' ||
  has_table_privilege('authenticated','public.ai_subscriptions','INSERT') || '|' ||
  has_table_privilege('authenticated','public.ai_subscriptions','UPDATE') || '|' ||
  has_table_privilege('authenticated','public.ai_subscriptions','DELETE') || '|' ||
  has_table_privilege('anon','public.ai_subscriptions','SELECT');
SELECT 'priv_files|' ||
  has_table_privilege('authenticated','public.ai_generated_files','SELECT') || '|' ||
  has_table_privilege('authenticated','public.ai_generated_files','INSERT') || '|' ||
  has_table_privilege('authenticated','public.ai_generated_files','UPDATE') || '|' ||
  has_table_privilege('authenticated','public.ai_generated_files','DELETE') || '|' ||
  has_table_privilege('anon','public.ai_generated_files','SELECT');
SELECT 'service_read|' ||
  has_table_privilege('service_role','public.ai_subscriptions','SELECT') || '|' ||
  has_table_privilege('service_role','public.ai_subscriptions','INSERT');
SELECT 'text_quota|' ||
  (position('v_hour_requests integer := 4' in def) > 0) || '|' ||
  (position('v_day_requests integer := 8' in def) > 0) || '|' ||
  (position('v_month_requests integer := 40' in def) > 0)
FROM (SELECT pg_get_functiondef('public.consume_ai_budget(uuid,integer)'::regprocedure) AS def) s;
SELECT 'image_quota|' ||
  (position('v_limit := 20' in def) > 0) || '|' ||
  (position('v_limit := 40' in def) > 0) || '|' ||
  (position('v_limit := 80' in def) > 0)
FROM (SELECT pg_get_functiondef('public.consume_ai_image_budget(uuid,integer)'::regprocedure) AS def) s;
SELECT 'execute_image|' ||
  has_function_privilege('authenticated','public.consume_ai_image_budget(uuid,integer)','EXECUTE') || '|' ||
  has_function_privilege('anon','public.consume_ai_image_budget(uuid,integer)','EXECUTE') || '|' ||
  has_function_privilege('service_role','public.consume_ai_image_budget(uuid,integer)','EXECUTE');
SELECT 'execute_text|' ||
  has_function_privilege('authenticated','public.consume_ai_budget(uuid,integer)','EXECUTE') || '|' ||
  has_function_privilege('service_role','public.consume_ai_budget(uuid,integer)','EXECUTE');
SELECT 'touch|' || has_function_privilege('authenticated','public.ai_message_touch()','EXECUTE');
SELECT 'bucket|' || id || '|' || public || '|' || file_size_limit
FROM storage.buckets
WHERE id IN ('ai-attachments','ai-generated')
ORDER BY id;
SELECT 'plan|' || pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'ai_subscriptions_plan';
SELECT 'spend_day|' || limit_usd_micros::text
FROM havkar_private.ai_spend_limits
WHERE scope = 'global' AND period = 'day' AND enabled = TRUE
  AND user_id IS NULL AND plan_code IS NULL;
SELECT 'spend_month|' || limit_usd_micros::text
FROM havkar_private.ai_spend_limits
WHERE scope = 'global' AND period = 'month' AND enabled = TRUE
  AND user_id IS NULL AND plan_code IS NULL;
ROLLBACK;
SQL
)"
  printf '%s\n' "$result"
  grep -qx 'migrations|36' <<<"$result" || die "history count is not 36"
  grep -qx 'latest|20261019201000|ai_global_spend_limit_required' <<<"$result" || die "latest history row mismatch"
  grep -qx 'recorded|11' <<<"$result" || die "eleven history rows were not recorded"
  grep -qx 'spend_day|1000000' <<<"$result" || die "global daily spend limit is not 1000000 micros"
  grep -qx 'spend_month|10000000' <<<"$result" || die "global monthly spend limit is not 10000000 micros"
  grep -qx 'users|3' <<<"$result" || die "user count changed"
  grep -qx 'profiles|3' <<<"$result" || die "profile count changed"
  grep -qx 'ads|8' <<<"$result" || die "ad count changed"
  grep -qx 'jobs|1' <<<"$result" || die "job count changed"
  grep -qx 'wallets|3' <<<"$result" || die "wallet count changed"
  grep -qx 'policies|176' <<<"$result" || die "policy count is not 176"
  grep -qx 'storage_objects|1' <<<"$result" || die "storage object count changed"
  grep -qx 'storage_buckets|7' <<<"$result" || die "bucket count is not 7"
  grep -qx 'ai_rows|0|0|0|0|0' <<<"$result" || die "AI tables contain rows"
  grep -qx 'rls|ai_generated_files|true' <<<"$result" || die "generated file RLS is off"
  grep -qx 'rls|ai_messages|true' <<<"$result" || die "message RLS is off"
  grep -qx 'rls|ai_subscriptions|true' <<<"$result" || die "subscription RLS is off"
  grep -qx 'priv_messages|true|true|false|false|false' <<<"$result" || die "message privileges mismatch"
  grep -qx 'priv_subscriptions|true|false|false|false|false' <<<"$result" || die "subscription privileges mismatch"
  grep -qx 'priv_files|true|false|false|false|false' <<<"$result" || die "generated file privileges mismatch"
  grep -qx 'service_read|true|true' <<<"$result" || die "service role cannot read subscriptions"
  grep -qx 'text_quota|true|true|true' <<<"$result" || die "free text quota mismatch"
  grep -qx 'image_quota|true|true|true' <<<"$result" || die "paid image quota mismatch"
  grep -qx 'execute_image|false|false|true' <<<"$result" || die "image budget execute privileges mismatch"
  grep -qx 'execute_text|false|true' <<<"$result" || die "text budget execute privileges mismatch"
  grep -qx 'touch|false' <<<"$result" || die "authenticated can execute ai_message_touch"
  grep -qx 'bucket|ai-attachments|false|4194304' <<<"$result" || die "attachment bucket mismatch"
  grep -qx 'bucket|ai-generated|false|8388608' <<<"$result" || die "generated bucket mismatch"
  grep -qxF "plan|CHECK ((plan_code = ANY (ARRAY['free'::text, 'plus'::text, 'pro'::text, 'business'::text])))" <<<"$result" || die "plan check mismatch"
  echo "POSTCHECK_OK"
}

prove_rollback() {
  local status=0
  set +e
  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'CREATE TABLE public.havkar_tx_probe (id integer);\n'
    printf "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('99990101000000', 'probe');\n"
    printf 'DO $$ BEGIN RAISE EXCEPTION '\''forced failure'\''; END $$;\n'
  } | run_sql apply
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || die "rollback probe unexpectedly committed"
  local left
  left="$(run_sql read <<'SQL'
BEGIN READ ONLY;
SELECT 'probe_table|' || (to_regclass('public.havkar_tx_probe') IS NULL);
SELECT 'probe_history|' || count(*) FROM supabase_migrations.schema_migrations WHERE version = '99990101000000';
SELECT 'migrations|' || count(*) FROM supabase_migrations.schema_migrations;
ROLLBACK;
SQL
)"
  printf '%s\n' "$left"
  grep -qx 'probe_table|true' <<<"$left" || die "failed probe left a table"
  grep -qx 'probe_history|0' <<<"$left" || die "failed probe left history"
  grep -qx 'migrations|36' <<<"$left" || die "failed probe changed history count"
  echo "ROLLBACK_OK"
}

require_target
check_hashes
check_backup
preflight
if [[ "${HAVKAR_MIGRATION_PREFLIGHT_ONLY:-}" == "1" ]]; then
  echo "PREFLIGHT_ONLY_OK"
  exit 0
fi
if [[ "${HAVKAR_MIGRATION_TARGET}" == "production" && "${HAVKAR_MIGRATION_APPLY:-}" != "1" ]]; then
  die "production apply requires HAVKAR_MIGRATION_APPLY=1 after a separate preflight"
fi

for entry in "${STEPS[@]}"; do
  IFS='|' read -r version name file expected <<<"$entry"
  apply_step "$version" "$name" "$file"
done

postcheck
if [[ "${HAVKAR_MIGRATION_PROVE_ROLLBACK:-}" == "1" ]]; then
  prove_rollback
fi
echo "MIGRATION_SEQUENCE_OK"
