DO $$
DECLARE
  seen bigint;
BEGIN
  PERFORM set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"app_metadata":{"role":"admin"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 1 THEN
    RAISE EXCEPTION 'precheck expected the old jwt admin claim to read commission, saw %', seen;
  END IF;
  EXECUTE 'RESET ROLE';
END $$;

SELECT 'PRECHECK_JWT_ADMIN_STILL_UNSCOPED' AS result;
