CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('havkar.test_jwt', true), '')::jsonb;
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
