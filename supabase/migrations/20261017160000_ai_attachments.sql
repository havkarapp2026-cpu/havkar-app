INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
SELECT
  'ai-attachments',
  'ai-attachments',
  false,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'ai-attachments'
);

DROP POLICY IF EXISTS ai_attachments_insert_own ON storage.objects;
CREATE POLICY ai_attachments_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ai-attachments'
    AND (SELECT auth.uid()) IS NOT NULL
    AND cardinality(storage.foldername(name)) = 1
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
    AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  );

DROP POLICY IF EXISTS ai_attachments_select_own ON storage.objects;
CREATE POLICY ai_attachments_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ai-attachments'
    AND (SELECT auth.uid()) IS NOT NULL
    AND cardinality(storage.foldername(name)) = 1
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS ai_attachments_delete_own ON storage.objects;
CREATE POLICY ai_attachments_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ai-attachments'
    AND (SELECT auth.uid()) IS NOT NULL
    AND cardinality(storage.foldername(name)) = 1
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );
