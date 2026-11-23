-- Server-side enforcement: licensed service categories require an approved
-- professional credential review before publish/update to active.
-- Does not move money. Additive.

CREATE OR REPLACE FUNCTION public.enforce_licensed_service_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $function$
DECLARE
  needs_license boolean := false;
  approved_exists boolean := false;
  cat text := lower(trim(coalesce(NEW.category, '')));
BEGIN
  -- Only gate active listings. paused/closed can exist without badge.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS NULL THEN
    RAISE EXCEPTION 'provider_id required'
      USING ERRCODE = 'check_violation';
  END IF;

  needs_license := cat = ANY (ARRAY[
    'electrical',
    'plumbing',
    'auto services',
    'health',
    'medical',
    'legal',
    'accounting'
  ]);

  IF NOT needs_license THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_provider_credential_reviews r
    WHERE r.provider_id = NEW.provider_id
      AND lower(trim(r.category)) = cat
      AND r.status = 'approved'
      AND (r.expires_at IS NULL OR r.expires_at >= CURRENT_DATE)
  ) INTO approved_exists;

  IF NOT approved_exists THEN
    RAISE EXCEPTION
      'Licensed category "%" requires an approved professional credential review before publishing. Verified badge is never granted without review.',
      NEW.category
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS services_license_credentials_enforce ON public.services;
CREATE TRIGGER services_license_credentials_enforce
BEFORE INSERT OR UPDATE OF category, status, provider_id
ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.enforce_licensed_service_credentials();

REVOKE ALL ON FUNCTION public.enforce_licensed_service_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_licensed_service_credentials() TO authenticated, service_role;
