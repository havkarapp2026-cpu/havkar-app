-- Health license document path + private evidence bucket (Owner/reviewer only via service role/API).
-- Safe additive migration. Does not invent providers or publish unverified claims.

ALTER TABLE public.health_providers
  ADD COLUMN IF NOT EXISTS license_document_path text;

ALTER TABLE public.health_providers
  ADD COLUMN IF NOT EXISTS business_registration_id text;

ALTER TABLE public.health_providers
  ADD COLUMN IF NOT EXISTS organization_legal_name text;

COMMENT ON COLUMN public.health_providers.license_document_path IS
  'Private storage object path for submitted credential evidence. Not publicly readable.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-evidence',
  'health-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "health_evidence_owner_upload" ON storage.objects;
CREATE POLICY "health_evidence_owner_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'health-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "health_evidence_owner_read_own" ON storage.objects;
CREATE POLICY "health_evidence_owner_read_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'health-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
