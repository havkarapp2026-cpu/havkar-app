-- PENDING OWNER APPROVAL — DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT CONFIRMATION.
-- Target primary owner (legal):
--   user_id: 9b34b0bb-271a-49ee-aeb7-a9d28be06a06
--   email:   havkarapp2026@gmail.com
--   name:    Amir Jalilnia
--
-- Prerequisites:
--   1) Apply migration 20261109210000_owner_admin_hardening_and_bootstrap_helpers.sql
--   2) Owner confirms in writing to apply this script on Production
--   3) Replace PHRASE_HASH and RECOVERY_HASH with SHA-256 hex digests of secrets
--      that are stored offline (never commit plaintext secrets)
--
-- After success: owner must refresh session / re-login so JWT carries role_generation.
-- Rollback (only if first bootstrap must be undone):
--   SELECT set_config('havkar.owner_bootstrap_rollback', 'on', true);
--   SELECT havkar_private.rollback_bootstrap_owner('9b34b0bb-271a-49ee-aeb7-a9d28be06a06');

BEGIN;

DO $$
DECLARE
  target uuid := '9b34b0bb-271a-49ee-aeb7-a9d28be06a06';
  generation bigint := 1;
  phrase_hash text := 'PHRASE_HASH_REPLACE_ME';
  recovery_hash text := 'RECOVERY_HASH_REPLACE_ME';
BEGIN
  IF phrase_hash LIKE 'PHRASE_HASH%' OR recovery_hash LIKE 'RECOVERY_HASH%' THEN
    RAISE EXCEPTION 'Replace PHRASE_HASH and RECOVERY_HASH before running';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users account
    WHERE account.id = target
      AND lower(account.email) = 'havkarapp2026@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Target owner account mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM havkar_private.owner_identity) THEN
    RAISE EXCEPTION 'Production already has an owner_identity row';
  END IF;

  PERFORM set_config('havkar.owner_mutation', 'on', true);
  PERFORM havkar_private.bootstrap_primary_owner(
    target,
    generation,
    phrase_hash,
    recovery_hash
  );
END $$;

COMMIT;
