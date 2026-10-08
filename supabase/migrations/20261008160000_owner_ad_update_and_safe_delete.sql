-- Owners may update their own ads.
-- Owners may delete an ad only when nothing still points at it.
-- Existing SELECT and INSERT policies are unchanged.
-- The ownership trigger enforce_ad_owner_write is unchanged.
-- This migration does not insert, update, or delete any advertisement,
-- save, comment, reaction, conversation, or message.

CREATE OR REPLACE FUNCTION public.ad_has_blocking_dependencies(target_ad_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  /*
   * Non-owners get one fixed answer. The conversation table is not read
   * for them, so this function does not reveal whether a private
   * conversation exists.
   */
  IF NOT EXISTS (
    SELECT 1
    FROM public.ads
    WHERE id = target_ad_id
      AND user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.ad_saves
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.ad_comments
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.ad_reactions
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE ad_id = target_ad_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  TO authenticated;

DROP POLICY IF EXISTS "Owners can update their own ads"
  ON public.ads;

CREATE POLICY "Owners can update their own ads"
ON public.ads
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Owners can delete their own ads when nothing depends on them"
  ON public.ads;

CREATE POLICY "Owners can delete their own ads when nothing depends on them"
ON public.ads
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND NOT public.ad_has_blocking_dependencies(id)
);

/*
 * Replace CASCADE and SET NULL with RESTRICT on the four ad references.
 * Existing rows are validated and kept. A delete that would remove or
 * detach a dependent row fails instead.
 */
DO $fk$
DECLARE
  constraint_row record;
  matched_count integer := 0;
BEGIN
  FOR constraint_row IN
    SELECT
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      constraint_info.conname,
      constraint_info.confdeltype
    FROM pg_constraint AS constraint_info
    JOIN pg_class AS child
      ON child.oid = constraint_info.conrelid
    JOIN pg_namespace AS child_ns
      ON child_ns.oid = child.relnamespace
    JOIN pg_class AS parent
      ON parent.oid = constraint_info.confrelid
    JOIN pg_namespace AS parent_ns
      ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute AS child_column
      ON child_column.attrelid = constraint_info.conrelid
     AND child_column.attnum = constraint_info.conkey[1]
    WHERE constraint_info.contype = 'f'
      AND parent_ns.nspname = 'public'
      AND parent.relname = 'ads'
      AND child_ns.nspname = 'public'
      AND child.relname IN (
        'ad_saves',
        'ad_comments',
        'ad_reactions',
        'conversations'
      )
      AND child_column.attname = 'ad_id'
      AND cardinality(constraint_info.conkey) = 1
  LOOP
    matched_count := matched_count + 1;

    IF constraint_row.confdeltype = 'r' THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      constraint_row.child_schema,
      constraint_row.child_table,
      constraint_row.conname
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (ad_id) REFERENCES public.ads (id) ON DELETE RESTRICT',
      constraint_row.child_schema,
      constraint_row.child_table,
      constraint_row.conname
    );
  END LOOP;

  IF matched_count <> 4 THEN
    RAISE EXCEPTION
      'expected 4 foreign keys from ad_id to public.ads, found %',
      matched_count;
  END IF;
END
$fk$;
