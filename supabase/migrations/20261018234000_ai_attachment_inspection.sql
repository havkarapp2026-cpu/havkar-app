-- Server-side inspection records for HAVKAR AI attachments.
-- Clients still cannot mark a file clean: ai_file_reviews_own keeps
-- WITH CHECK (scan_status = 'unscanned'), and UPDATE is revoked from
-- client roles and from service_role. Only this security-definer function,
-- called by the assistant after it has inspected the bytes, may set
-- clean or rejected. Generated-file rows stay unscanned.

ALTER TABLE public.ai_file_reviews
  DROP CONSTRAINT IF EXISTS ai_file_reviews_scan;

ALTER TABLE public.ai_file_reviews
  ADD CONSTRAINT ai_file_reviews_scan CHECK (
    scan_status IN ('unscanned', 'clean', 'rejected')
  );

ALTER TABLE public.ai_file_reviews
  ADD COLUMN IF NOT EXISTS inspected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS byte_count integer;

ALTER TABLE public.ai_file_reviews
  DROP CONSTRAINT IF EXISTS ai_file_reviews_bytes;

ALTER TABLE public.ai_file_reviews
  ADD CONSTRAINT ai_file_reviews_bytes CHECK (
    byte_count IS NULL OR (byte_count >= 16 AND byte_count <= 4194304)
  );

COMMENT ON COLUMN public.ai_file_reviews.scan_status IS
  'unscanned until the assistant inspects the stored bytes. clean and rejected are written only by record_ai_attachment_inspection.';

CREATE OR REPLACE FUNCTION public.record_ai_attachment_inspection(
  p_user_id uuid,
  p_path text,
  p_status text,
  p_byte_count integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_file$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_status NOT IN ('clean', 'rejected') THEN
    RETURN FALSE;
  END IF;
  IF p_byte_count IS NULL OR p_byte_count < 16 OR p_byte_count > 4194304 THEN
    RETURN FALSE;
  END IF;
  IF p_path IS NULL
     OR p_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  THEN
    RETURN FALSE;
  END IF;
  IF lower(pg_catalog.split_part(p_path, '/', 1)) <> lower(p_user_id::text) THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_catalog.set_config('row_security', 'off', true);

  UPDATE public.ai_file_reviews
  SET scan_status = p_status,
      inspected_at = pg_catalog.clock_timestamp(),
      byte_count = p_byte_count
  WHERE path = p_path
    AND user_id = p_user_id
    AND bucket_id = 'ai-attachments'
    AND lower(pg_catalog.split_part(path, '/', 1)) = lower(p_user_id::text)
    AND scan_status IN ('unscanned', 'clean', 'rejected');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$ai_file$;

REVOKE ALL ON FUNCTION public.record_ai_attachment_inspection(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_attachment_inspection(uuid, text, text, integer)
  TO service_role;

REVOKE UPDATE ON TABLE public.ai_file_reviews FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
