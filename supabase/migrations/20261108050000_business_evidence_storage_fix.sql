-- Fix business-evidence storage INSERT policy.
-- storage.foldername(path) returns only folder segments (uid, doc_type), not the filename.
-- The previous cardinality = 3 check blocked every legitimate upload.

DROP POLICY IF EXISTS business_evidence_storage_insert ON storage.objects;
CREATE POLICY business_evidence_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-evidence'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower(((SELECT auth.uid()))::text)
  AND cardinality(storage.foldername(name)) = 2
  AND (storage.foldername(name))[2] = ANY (ARRAY[
    'vat_registration',
    'company_registration',
    'proof_of_registered_address',
    'other_supporting'
  ])
  AND name !~* '(^|/)identity(/|$)|passport|selfie|id[_-]?card'
);

-- Allow owners to replace/remove their own evidence objects.
DROP POLICY IF EXISTS business_evidence_storage_update_own ON storage.objects;
CREATE POLICY business_evidence_storage_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-evidence'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower(((SELECT auth.uid()))::text)
)
WITH CHECK (
  bucket_id = 'business-evidence'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower(((SELECT auth.uid()))::text)
  AND cardinality(storage.foldername(name)) = 2
  AND (storage.foldername(name))[2] = ANY (ARRAY[
    'vat_registration',
    'company_registration',
    'proof_of_registered_address',
    'other_supporting'
  ])
  AND name !~* '(^|/)identity(/|$)|passport|selfie|id[_-]?card'
);

DROP POLICY IF EXISTS business_evidence_storage_delete_own ON storage.objects;
CREATE POLICY business_evidence_storage_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-evidence'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower(((SELECT auth.uid()))::text)
);

-- Owners may delete their own document metadata rows when replacing uploads.
DROP POLICY IF EXISTS business_docs_delete_own ON public.business_application_documents;
CREATE POLICY business_docs_delete_own
ON public.business_application_documents
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.business_applications ba
    WHERE ba.id = application_id
      AND ba.user_id = (SELECT auth.uid())
      AND lower(COALESCE(ba.status, '')) IN ('pending', 'needs_more_info', 'under_review')
  )
);

GRANT DELETE ON TABLE public.business_application_documents TO authenticated;

-- One business application per authenticated user.
CREATE UNIQUE INDEX IF NOT EXISTS business_applications_one_per_user_idx
ON public.business_applications (user_id)
WHERE user_id IS NOT NULL;
