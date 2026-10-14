-- Secure owner recovery for a direct project database session.
-- Do not run this file as a migration and do not apply it to production.
-- It assigns no owner, changes no auth user, and activates no payment.
--
-- This procedure never replaces havkar_private.caller_is_admin().
-- A rollback that compares auth.jwt() role claims is forbidden.
-- Admin authority stays on the database assignment, role generation,
-- and a live auth.sessions row.
--
-- Ceremony, only when session_user = current_user.
-- SET ROLE, the API, and service_role cannot pass that check.
--
-- 1. From that direct session, arm the named replacement account:
--    SELECT havkar_private.arm_owner_recovery(
--      '<target-uuid>'::uuid,
--      '<target-uuid>'::uuid,
--      '<current-recovery-code>'
--    );
-- 2. That same account signs in and calls:
--    SELECT public.accept_owner_identity('recovery');
-- 3. From the direct session, commit once with a new phrase and a
--    new recovery code. Both values are entered twice and must differ:
--    SELECT havkar_private.commit_owner_recovery(
--      '<arm-uuid>'::uuid,
--      '<target-uuid>'::uuid,
--      '<target-uuid>'::uuid,
--      '<current-recovery-code>',
--      '<new-phrase>',
--      '<new-phrase>',
--      '<new-recovery-code>',
--      '<new-recovery-code>'
--    );
--
-- The statements above are comments. Running this file only verifies
-- that the installed admin check is still database-backed.

DO $$
DECLARE
  admin_def text := pg_get_functiondef('havkar_private.caller_is_admin()'::regprocedure);
  owner_def text := pg_get_functiondef('havkar_private.caller_is_owner()'::regprocedure);
BEGIN
  IF position('caller_matches_admin_assignment' IN admin_def) = 0
     OR position('app_metadata' IN admin_def) > 0
     OR position('user_metadata' IN admin_def) > 0 THEN
    RAISE EXCEPTION 'recovery must not restore jwt-only admin authorization';
  END IF;

  IF position('owner_identity' IN owner_def) = 0
     OR position('app_metadata' IN owner_def) > 0 THEN
    RAISE EXCEPTION 'owner authorization does not read the owner row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE nspname = 'public'
      AND proname IN ('havkar_session_is_admin', 'havkar_session_is_owner')
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'session gates must stay invoker wrappers';
  END IF;
END $$;

SELECT 'OWNER_RECOVERY_PROCEDURE_VERIFIED' AS result;
