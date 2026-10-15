-- Public business pages, ordered menus, and a bounded assistant draft limit.
--
-- Do not apply this file to production project gispovnciifgikvgpzck
-- until a separate approval. It does not assign an owner, does not change
-- payment approval, and does not alter Owner, Admin, or Staff tables.
-- Price labels are display text. This file does not create a charge.

CREATE SCHEMA IF NOT EXISTS havkar_private;

CREATE TABLE public.business_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  category_code text NOT NULL,
  category_label text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  logo_path text,
  cover_path text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT business_pages_slug_format
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  CONSTRAINT business_pages_slug_reserved
    CHECK (slug NOT IN (
      'about', 'admin', 'api', 'business', 'delivery', 'index', 'login',
      'owner', 'profile', 'signup', 'staff', 'support', 'wallet'
    )),
  CONSTRAINT business_pages_name_length
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT business_pages_category_code
    CHECK (category_code IN (
      'restaurant', 'cafe', 'bakery', 'grocery', 'factory', 'retail',
      'wholesale', 'professional_services', 'health', 'education',
      'construction', 'transport', 'beauty', 'hospitality', 'technology',
      'agriculture', 'arts', 'nonprofit', 'other'
    )),
  CONSTRAINT business_pages_category_label
    CHECK (
      (category_code <> 'other' AND category_label = '')
      OR (category_code = 'other' AND char_length(category_label) BETWEEN 2 AND 80)
    ),
  CONSTRAINT business_pages_summary_length
    CHECK (char_length(summary) <= 280),
  CONSTRAINT business_pages_description_length
    CHECK (char_length(description) <= 4000),
  CONSTRAINT business_pages_logo_path
    CHECK (
      logo_path IS NULL
      OR (
        logo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
        AND split_part(logo_path, '/', 1) = owner_id::text
      )
    ),
  CONSTRAINT business_pages_cover_path
    CHECK (
      cover_path IS NULL
      OR (
        cover_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
        AND split_part(cover_path, '/', 1) = owner_id::text
      )
    )
);

CREATE UNIQUE INDEX business_pages_slug_key ON public.business_pages (slug);
CREATE INDEX business_pages_owner_idx ON public.business_pages (owner_id);

CREATE TABLE public.business_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.business_pages (id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  CONSTRAINT business_sections_position CHECK (position BETWEEN 1 AND 40),
  CONSTRAINT business_sections_title CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT business_sections_body CHECK (char_length(body) <= 4000),
  CONSTRAINT business_sections_page_position UNIQUE (page_id, position)
);

CREATE TABLE public.business_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.business_pages (id) ON DELETE CASCADE,
  kind text NOT NULL,
  position integer NOT NULL,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  price_label text NOT NULL DEFAULT '',
  CONSTRAINT business_offerings_kind CHECK (kind IN ('service', 'product')),
  CONSTRAINT business_offerings_position CHECK (position BETWEEN 1 AND 200),
  CONSTRAINT business_offerings_title CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT business_offerings_details CHECK (char_length(details) <= 2000),
  CONSTRAINT business_offerings_price_label CHECK (char_length(price_label) <= 40),
  CONSTRAINT business_offerings_page_kind_position UNIQUE (page_id, kind, position)
);

COMMENT ON COLUMN public.business_offerings.price_label IS
  'Display text only. This column does not create a payment or a charge.';

CREATE TABLE public.business_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.business_pages (id) ON DELETE CASCADE,
  position integer NOT NULL,
  item_number integer NOT NULL,
  name text NOT NULL,
  details text NOT NULL DEFAULT '',
  price_label text NOT NULL DEFAULT '',
  CONSTRAINT business_menu_items_position CHECK (position BETWEEN 1 AND 500),
  CONSTRAINT business_menu_items_number CHECK (item_number BETWEEN 1 AND 500),
  CONSTRAINT business_menu_items_name CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT business_menu_items_details CHECK (char_length(details) <= 1000),
  CONSTRAINT business_menu_items_price_label CHECK (char_length(price_label) <= 40),
  CONSTRAINT business_menu_items_page_position UNIQUE (page_id, position),
  CONSTRAINT business_menu_items_page_number UNIQUE (page_id, item_number)
);

COMMENT ON COLUMN public.business_menu_items.price_label IS
  'Display text only. This column does not create a payment or a charge.';
COMMENT ON TABLE public.business_menu_items IS
  'Numbered menu rows. position and item_number keep the owner order, including menus of 60 or more items.';

CREATE TABLE public.business_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.business_pages (id) ON DELETE CASCADE,
  position integer NOT NULL,
  object_path text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  CONSTRAINT business_images_position CHECK (position BETWEEN 1 AND 12),
  CONSTRAINT business_images_alt CHECK (char_length(alt_text) <= 160),
  CONSTRAINT business_images_path
    CHECK (object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'),
  CONSTRAINT business_images_page_position UNIQUE (page_id, position)
);

CREATE INDEX business_sections_page_idx ON public.business_sections (page_id, position);
CREATE INDEX business_offerings_page_idx ON public.business_offerings (page_id, kind, position);
CREATE INDEX business_menu_items_page_idx ON public.business_menu_items (page_id, position);
CREATE INDEX business_images_page_idx ON public.business_images (page_id, position);

CREATE OR REPLACE FUNCTION havkar_private.guard_business_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  page_count integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*)
      INTO page_count
    FROM public.business_pages
    WHERE owner_id = NEW.owner_id;

    IF page_count >= 8 THEN
      RAISE EXCEPTION 'business page limit reached' USING ERRCODE = '54000';
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.guard_business_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT page.owner_id
    INTO owner
  FROM public.business_pages AS page
  WHERE page.id = NEW.page_id;

  IF owner IS NULL OR owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'business_images' THEN
    IF split_part(NEW.object_path, '/', 1) IS DISTINCT FROM owner::text THEN
      RAISE EXCEPTION 'business image owner mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_business_page() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.guard_business_child() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER business_pages_guard
BEFORE INSERT OR UPDATE ON public.business_pages
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_page();

CREATE TRIGGER business_sections_guard
BEFORE INSERT OR UPDATE ON public.business_sections
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_child();

CREATE TRIGGER business_offerings_guard
BEFORE INSERT OR UPDATE ON public.business_offerings
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_child();

CREATE TRIGGER business_menu_items_guard
BEFORE INSERT OR UPDATE ON public.business_menu_items
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_child();

CREATE TRIGGER business_images_guard
BEFORE INSERT OR UPDATE ON public.business_images
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_child();

ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_pages_public_read
ON public.business_pages
FOR SELECT
TO anon, authenticated
USING (published = true);

CREATE POLICY business_pages_owner_select
ON public.business_pages
FOR SELECT
TO authenticated
USING (owner_id = (SELECT auth.uid()));

CREATE POLICY business_pages_owner_insert
ON public.business_pages
FOR INSERT
TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY business_pages_owner_update
ON public.business_pages
FOR UPDATE
TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY business_pages_owner_delete
ON public.business_pages
FOR DELETE
TO authenticated
USING (owner_id = (SELECT auth.uid()));

CREATE POLICY business_sections_public_read
ON public.business_sections
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.published = true
  )
);

CREATE POLICY business_sections_owner_all
ON public.business_sections
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY business_offerings_public_read
ON public.business_offerings
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.published = true
  )
);

CREATE POLICY business_offerings_owner_all
ON public.business_offerings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY business_menu_items_public_read
ON public.business_menu_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.published = true
  )
);

CREATE POLICY business_menu_items_owner_all
ON public.business_menu_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY business_images_public_read
ON public.business_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.published = true
  )
);

CREATE POLICY business_images_owner_all
ON public.business_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = page_id
      AND page.owner_id = (SELECT auth.uid())
  )
);

REVOKE ALL ON TABLE public.business_pages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_sections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_offerings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_menu_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_images FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.business_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_pages TO authenticated;
GRANT ALL ON TABLE public.business_pages TO service_role;

GRANT SELECT ON TABLE public.business_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_sections TO authenticated;
GRANT ALL ON TABLE public.business_sections TO service_role;

GRANT SELECT ON TABLE public.business_offerings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_offerings TO authenticated;
GRANT ALL ON TABLE public.business_offerings TO service_role;

GRANT SELECT ON TABLE public.business_menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_menu_items TO authenticated;
GRANT ALL ON TABLE public.business_menu_items TO service_role;

GRANT SELECT ON TABLE public.business_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_images TO authenticated;
GRANT ALL ON TABLE public.business_images TO service_role;

REVOKE SELECT (owner_id) ON TABLE public.business_pages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_budget(
  p_user_id uuid,
  p_characters integer
)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_epoch bigint;
  v_hour bigint;
  v_day bigint;
  v_hour_start timestamp with time zone;
  v_day_start timestamp with time zone;
  v_hour_retry integer;
  v_day_retry integer;
  v_retry integer;
  v_ok boolean;
BEGIN
  IF p_user_id IS NULL
     OR p_characters IS NULL
     OR p_characters < 1
     OR p_characters > 6000
  THEN
    RAISE EXCEPTION 'invalid assistant budget request'
      USING ERRCODE = '22023';
  END IF;

  v_epoch := pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())
  )::bigint;
  v_hour := v_epoch / 3600;
  v_day := v_epoch / 86400;
  v_hour_start := pg_catalog.to_timestamp(v_hour * 3600);
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_hour_retry := ((v_hour + 1) * 3600 - v_epoch)::integer;
  v_day_retry := ((v_day + 1) * 86400 - v_epoch)::integer;

  IF v_hour_retry < 1 THEN
    v_hour_retry := 1;
  END IF;

  IF v_day_retry < 1 THEN
    v_day_retry := 1;
  END IF;

  DELETE FROM havkar_private.ai_usage_buckets
  WHERE window_start < v_day_start - interval '2 days';

  BEGIN
    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'g:d:' || v_day::text,
      v_day_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 1500
      AND bucket.characters + EXCLUDED.characters <= 400000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'u:d:' || p_user_id::text || ':' || v_day::text,
      v_day_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 30
      AND bucket.characters + EXCLUDED.characters <= 15000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'u:h:' || p_user_id::text || ':' || v_hour::text,
      v_hour_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 12
      AND bucket.characters + EXCLUDED.characters <= 6000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_hour_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
    END IF;

    allowed := TRUE;
    retry_after := 0;
    RETURN NEXT;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      allowed := FALSE;
      retry_after := v_retry;
      RETURN NEXT;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_budget(uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_ai_budget(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.consume_ai_budget(uuid, integer) IS
  'Atomically consumes the HAVKAR assistant budget for one verified user. One request can use at most 6000 characters. Hourly and daily caps stay in this function.';

DO $business_media$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'business-media bucket skipped because storage tables are absent';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'business-media') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'business-media',
      'business-media',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    );
  END IF;
END
$business_media$;

DO $business_media_policies$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS business_media_insert_own ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS business_media_select_own ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS business_media_update_own ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS business_media_delete_own ON storage.objects';

  EXECUTE $policy$
    CREATE POLICY business_media_insert_own
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
      AND cardinality(storage.foldername(name)) = 2
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY business_media_select_own
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
      AND cardinality(storage.foldername(name)) = 2
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY business_media_update_own
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
      AND cardinality(storage.foldername(name)) = 2
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
    WITH CHECK (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
      AND cardinality(storage.foldername(name)) = 2
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY business_media_delete_own
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
      AND cardinality(storage.foldername(name)) = 2
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
  $policy$;
END
$business_media_policies$;
