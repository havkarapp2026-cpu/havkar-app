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
  moderation_state text NOT NULL DEFAULT 'visible',
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
  CONSTRAINT business_pages_moderation_state
    CHECK (moderation_state IN ('visible', 'hidden')),
  CONSTRAINT business_pages_logo_path
    CHECK (logo_path IS NULL OR logo_path = id::text || '/logo.webp'),
  CONSTRAINT business_pages_cover_path
    CHECK (cover_path IS NULL OR cover_path = id::text || '/cover.webp')
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
  CONSTRAINT business_menu_items_number CHECK (item_number BETWEEN 1 AND 9999),
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
    CHECK (
      split_part(object_path, '/', 1) = page_id::text
      AND split_part(object_path, '/', 2) ~ '^image-(?:[1-9]|1[0-2])\.webp$'
      AND split_part(object_path, '/', 3) = ''
    ),
  CONSTRAINT business_images_page_position UNIQUE (page_id, position)
);

CREATE INDEX business_sections_page_idx ON public.business_sections (page_id, position);
CREATE INDEX business_offerings_page_idx ON public.business_offerings (page_id, kind, position);
CREATE INDEX business_menu_items_page_idx ON public.business_menu_items (page_id, position);
CREATE INDEX business_images_page_idx ON public.business_images (page_id, position);

CREATE OR REPLACE FUNCTION havkar_private.owner_has_approved_business(target_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_applications
    WHERE user_id = target_owner
      AND lower(status) = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION havkar_private.business_row_is_public(
  is_published boolean,
  target_owner uuid,
  moderation text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT is_published IS TRUE
    AND moderation = 'visible'
    AND havkar_private.owner_has_approved_business(target_owner);
$$;

REVOKE ALL ON FUNCTION havkar_private.owner_has_approved_business(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.business_row_is_public(boolean, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA havkar_private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.business_row_is_public(boolean, uuid, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION havkar_private.business_page_is_public(target_page uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = target_page
      AND havkar_private.business_row_is_public(page.published, page.owner_id, page.moderation_state)
  );
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_owns_business_page(target_page uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_pages AS page
    WHERE page.id = target_page
      AND page.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_owns_media_folder(folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND havkar_private.caller_owns_business_page(folder::uuid);
$$;

REVOKE ALL ON FUNCTION havkar_private.business_page_is_public(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.caller_owns_business_page(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.caller_owns_media_folder(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.business_page_is_public(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.caller_owns_business_page(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.caller_owns_media_folder(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.guard_business_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  page_count integer;
BEGIN
  IF pg_catalog.current_setting('havkar.business_moderation', true) = 'on' THEN
    IF TG_OP = 'INSERT'
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.display_name IS DISTINCT FROM OLD.display_name
       OR NEW.category_code IS DISTINCT FROM OLD.category_code
       OR NEW.category_label IS DISTINCT FROM OLD.category_label
       OR NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.logo_path IS DISTINCT FROM OLD.logo_path
       OR NEW.cover_path IS DISTINCT FROM OLD.cover_path
       OR NEW.published IS DISTINCT FROM OLD.published THEN
      RAISE EXCEPTION 'business moderation cannot change page content' USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      841420262,
      pg_catalog.hashtext(NEW.owner_id::text)
    );

    SELECT count(*)
      INTO page_count
    FROM public.business_pages
    WHERE owner_id = NEW.owner_id;

    IF page_count >= 8 THEN
      RAISE EXCEPTION 'business page limit reached' USING ERRCODE = '54000';
    END IF;

    IF pg_catalog.current_setting('havkar.business_moderation', true) IS DISTINCT FROM 'on' THEN
      NEW.moderation_state := 'visible';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.moderation_state IS DISTINCT FROM OLD.moderation_state
     AND pg_catalog.current_setting('havkar.business_moderation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'business moderation cannot be self-approved' USING ERRCODE = '42501';
  END IF;

  IF NEW.published IS TRUE
     AND NOT havkar_private.owner_has_approved_business(NEW.owner_id) THEN
    RAISE EXCEPTION 'business publication requires an approved application' USING ERRCODE = '42501';
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
    IF split_part(NEW.object_path, '/', 1) IS DISTINCT FROM NEW.page_id::text THEN
      RAISE EXCEPTION 'business image path mismatch' USING ERRCODE = '42501';
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
USING (havkar_private.business_row_is_public(published, owner_id, moderation_state));

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
USING (havkar_private.business_page_is_public(page_id));

CREATE POLICY business_sections_owner_all
ON public.business_sections
FOR ALL
TO authenticated
USING (havkar_private.caller_owns_business_page(page_id))
WITH CHECK (havkar_private.caller_owns_business_page(page_id));

CREATE POLICY business_offerings_public_read
ON public.business_offerings
FOR SELECT
TO anon, authenticated
USING (havkar_private.business_page_is_public(page_id));

CREATE POLICY business_offerings_owner_all
ON public.business_offerings
FOR ALL
TO authenticated
USING (havkar_private.caller_owns_business_page(page_id))
WITH CHECK (havkar_private.caller_owns_business_page(page_id));

CREATE POLICY business_menu_items_public_read
ON public.business_menu_items
FOR SELECT
TO anon, authenticated
USING (havkar_private.business_page_is_public(page_id));

CREATE POLICY business_menu_items_owner_all
ON public.business_menu_items
FOR ALL
TO authenticated
USING (havkar_private.caller_owns_business_page(page_id))
WITH CHECK (havkar_private.caller_owns_business_page(page_id));

CREATE POLICY business_images_public_read
ON public.business_images
FOR SELECT
TO anon, authenticated
USING (havkar_private.business_page_is_public(page_id));

CREATE POLICY business_images_owner_all
ON public.business_images
FOR ALL
TO authenticated
USING (havkar_private.caller_owns_business_page(page_id))
WITH CHECK (havkar_private.caller_owns_business_page(page_id));

REVOKE ALL ON TABLE public.business_pages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_sections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_offerings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_menu_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.business_images FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (
  id, slug, display_name, category_code, category_label, summary, description,
  logo_path, cover_path, published, created_at, updated_at
) ON TABLE public.business_pages TO anon;

GRANT SELECT (
  id, slug, display_name, category_code, category_label, summary, description,
  logo_path, cover_path, published, moderation_state, created_at, updated_at
) ON TABLE public.business_pages TO authenticated;

GRANT INSERT (
  id, owner_id, slug, display_name, category_code, category_label, summary,
  description, logo_path, cover_path, published
) ON TABLE public.business_pages TO authenticated;

GRANT UPDATE (
  slug, display_name, category_code, category_label, summary, description,
  logo_path, cover_path, published
) ON TABLE public.business_pages TO authenticated;

GRANT DELETE ON TABLE public.business_pages TO authenticated;
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

CREATE VIEW public.business_pages_public
WITH (security_invoker = true) AS
SELECT
  id,
  slug,
  display_name,
  category_code,
  category_label,
  summary,
  description,
  logo_path,
  cover_path,
  published,
  created_at,
  updated_at
FROM public.business_pages;

REVOKE ALL ON TABLE public.business_pages_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.business_pages_public TO anon, authenticated;
GRANT ALL ON TABLE public.business_pages_public TO service_role;

COMMENT ON VIEW public.business_pages_public IS
  'Public business page columns. The account identifier is not part of this view.';

CREATE TABLE public.business_page_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.business_pages (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT business_page_reports_reason
    CHECK (reason IN ('spam', 'scam', 'impersonation', 'illegal', 'other')),
  CONSTRAINT business_page_reports_details
    CHECK (char_length(details) <= 1000),
  CONSTRAINT business_page_reports_status
    CHECK (status IN ('open', 'reviewed', 'dismissed')),
  CONSTRAINT business_page_reports_once UNIQUE (page_id, reporter_id)
);

CREATE INDEX business_page_reports_page_idx ON public.business_page_reports (page_id, created_at);

CREATE OR REPLACE FUNCTION havkar_private.guard_business_page_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.reporter_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business report owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
  ELSIF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
        OR NEW.page_id IS DISTINCT FROM OLD.page_id THEN
    RAISE EXCEPTION 'business report status cannot be self-approved' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_business_page_report()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER business_page_reports_guard
BEFORE INSERT OR UPDATE ON public.business_page_reports
FOR EACH ROW
EXECUTE FUNCTION havkar_private.guard_business_page_report();

ALTER TABLE public.business_page_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_page_reports_insert
ON public.business_page_reports
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = (SELECT auth.uid())
  AND status = 'open'
  AND havkar_private.business_page_is_public(page_id)
);

CREATE POLICY business_page_reports_select_own
ON public.business_page_reports
FOR SELECT
TO authenticated
USING (reporter_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.business_page_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT (
  page_id, reporter_id, reason, details
) ON TABLE public.business_page_reports TO authenticated;
GRANT SELECT (
  id, page_id, reporter_id, reason, details, status, created_at
) ON TABLE public.business_page_reports TO authenticated;
GRANT ALL ON TABLE public.business_page_reports TO service_role;

CREATE TABLE havkar_private.business_page_moderation (
  page_id uuid PRIMARY KEY REFERENCES public.business_pages (id) ON DELETE CASCADE,
  state text NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT business_page_moderation_state CHECK (state IN ('visible', 'hidden')),
  CONSTRAINT business_page_moderation_note CHECK (char_length(note) <= 1000)
);

ALTER TABLE havkar_private.business_page_moderation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE havkar_private.business_page_moderation
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.set_business_page_moderation(
  p_page_id uuid,
  p_state text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_state NOT IN ('visible', 'hidden') THEN
    RAISE EXCEPTION 'invalid moderation state' USING ERRCODE = '22023';
  END IF;

  IF p_note IS NULL OR char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'invalid moderation note' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('havkar.business_moderation', 'on', true);

  UPDATE public.business_pages
  SET moderation_state = p_state
  WHERE id = p_page_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'business page was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO havkar_private.business_page_moderation (page_id, state, note)
  VALUES (p_page_id, p_state, p_note)
  ON CONFLICT (page_id) DO UPDATE
  SET state = EXCLUDED.state,
      note = EXCLUDED.note,
      updated_at = pg_catalog.clock_timestamp();
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.set_business_page_moderation(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.set_business_page_moderation(uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_business_page(
  p_page_id uuid,
  p_page jsonb,
  p_sections jsonb,
  p_offerings jsonb,
  p_menu jsonb,
  p_images jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_existing uuid;
BEGIN
  v_owner := auth.uid();

  IF v_owner IS NULL OR p_page_id IS NULL OR pg_catalog.jsonb_typeof(p_page) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
  END IF;

  p_sections := COALESCE(p_sections, '[]'::jsonb);
  p_offerings := COALESCE(p_offerings, '[]'::jsonb);
  p_menu := COALESCE(p_menu, '[]'::jsonb);
  p_images := COALESCE(p_images, '[]'::jsonb);

  IF pg_catalog.jsonb_typeof(p_sections) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_offerings) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_menu) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_images) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_sections) > 40
     OR pg_catalog.jsonb_array_length(p_offerings) > 200
     OR pg_catalog.jsonb_array_length(p_menu) > 500
     OR pg_catalog.jsonb_array_length(p_images) > 12 THEN
    RAISE EXCEPTION 'business page content is too large' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(p_page->>'logo_path', '') IS NOT NULL
     AND p_page->>'logo_path' IS DISTINCT FROM p_page_id::text || '/logo.webp' THEN
    RAISE EXCEPTION 'business image path mismatch' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(p_page->>'cover_path', '') IS NOT NULL
     AND p_page->>'cover_path' IS DISTINCT FROM p_page_id::text || '/cover.webp' THEN
    RAISE EXCEPTION 'business image path mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT id
    INTO v_existing
  FROM public.business_pages
  WHERE id = p_page_id;

  IF v_existing IS NULL THEN
    INSERT INTO public.business_pages (
      id, owner_id, slug, display_name, category_code, category_label,
      summary, description, logo_path, cover_path, published
    ) VALUES (
      p_page_id,
      v_owner,
      p_page->>'slug',
      p_page->>'display_name',
      p_page->>'category_code',
      COALESCE(p_page->>'category_label', ''),
      COALESCE(p_page->>'summary', ''),
      COALESCE(p_page->>'description', ''),
      NULLIF(p_page->>'logo_path', ''),
      NULLIF(p_page->>'cover_path', ''),
      COALESCE((p_page->>'published')::boolean, false)
    );
  ELSE
    UPDATE public.business_pages
    SET slug = p_page->>'slug',
        display_name = p_page->>'display_name',
        category_code = p_page->>'category_code',
        category_label = COALESCE(p_page->>'category_label', ''),
        summary = COALESCE(p_page->>'summary', ''),
        description = COALESCE(p_page->>'description', ''),
        logo_path = NULLIF(p_page->>'logo_path', ''),
        cover_path = NULLIF(p_page->>'cover_path', ''),
        published = COALESCE((p_page->>'published')::boolean, false)
    WHERE id = p_page_id
      AND havkar_private.caller_owns_business_page(p_page_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'business page owner mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.business_sections WHERE page_id = p_page_id;
  DELETE FROM public.business_offerings WHERE page_id = p_page_id;
  DELETE FROM public.business_menu_items WHERE page_id = p_page_id;
  DELETE FROM public.business_images WHERE page_id = p_page_id;

  INSERT INTO public.business_sections (page_id, position, title, body)
  SELECT
    p_page_id,
    (item->>'position')::integer,
    item->>'title',
    COALESCE(item->>'body', '')
  FROM pg_catalog.jsonb_array_elements(p_sections) AS item;

  INSERT INTO public.business_offerings (page_id, kind, position, title, details, price_label)
  SELECT
    p_page_id,
    item->>'kind',
    (item->>'position')::integer,
    item->>'title',
    COALESCE(item->>'details', ''),
    COALESCE(item->>'price_label', '')
  FROM pg_catalog.jsonb_array_elements(p_offerings) AS item;

  INSERT INTO public.business_menu_items (page_id, position, item_number, name, details, price_label)
  SELECT
    p_page_id,
    (item->>'position')::integer,
    (item->>'item_number')::integer,
    item->>'name',
    COALESCE(item->>'details', ''),
    COALESCE(item->>'price_label', '')
  FROM pg_catalog.jsonb_array_elements(p_menu) AS item;

  INSERT INTO public.business_images (page_id, position, object_path, alt_text)
  SELECT
    p_page_id,
    (item->>'position')::integer,
    item->>'object_path',
    COALESCE(item->>'alt_text', '')
  FROM pg_catalog.jsonb_array_elements(p_images) AS item;

  RETURN p_page_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_page(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_business_page(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  TO authenticated;

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
DECLARE
  existing_public boolean;
  existing_limit bigint;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'business-media bucket skipped because storage tables are absent';
    RETURN;
  END IF;

  SELECT public, file_size_limit
    INTO existing_public, existing_limit
  FROM storage.buckets
  WHERE id = 'business-media';

  IF FOUND THEN
    IF existing_public IS DISTINCT FROM false OR existing_limit IS DISTINCT FROM 5242880 THEN
      RAISE EXCEPTION 'business-media bucket settings do not match the private page media bucket';
    END IF;
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'business-media',
      'business-media',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    );
  END IF;

  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
END
$business_media$;

DO $business_media_policies$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS business_media_insert_own ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS business_media_select_own ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS business_media_select_public ON storage.objects';
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
      AND cardinality(storage.foldername(name)) = 2
      AND havkar_private.caller_owns_media_folder(lower((storage.foldername(name))[1]))
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
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
      AND cardinality(storage.foldername(name)) = 2
      AND havkar_private.caller_owns_media_folder(lower((storage.foldername(name))[1]))
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
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
      AND cardinality(storage.foldername(name)) = 2
      AND havkar_private.caller_owns_media_folder(lower((storage.foldername(name))[1]))
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
    WITH CHECK (
      bucket_id = 'business-media'
      AND (SELECT auth.uid()) IS NOT NULL
      AND cardinality(storage.foldername(name)) = 2
      AND havkar_private.caller_owns_media_folder(lower((storage.foldername(name))[1]))
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
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
      AND cardinality(storage.foldername(name)) = 2
      AND havkar_private.caller_owns_media_folder(lower((storage.foldername(name))[1]))
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|image-[1-9]|image-1[0-2])\.webp$'
    )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY business_media_select_public
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (
      bucket_id = 'business-media'
      AND (
        EXISTS (
          SELECT 1
          FROM public.business_pages AS page
          WHERE havkar_private.business_page_is_public(page.id)
            AND (page.logo_path = name OR page.cover_path = name)
        )
        OR EXISTS (
          SELECT 1
          FROM public.business_images AS image
          WHERE image.object_path = name
            AND havkar_private.business_page_is_public(image.page_id)
        )
      )
    )
  $policy$;
END
$business_media_policies$;
