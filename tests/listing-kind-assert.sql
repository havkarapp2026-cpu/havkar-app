-- Behavior checks after 20261012140000_ads_listing_kind.sql.
-- Fails the psql session on the first unmet condition.

DO $preserve$
BEGIN
  IF (
    SELECT count(*)
    FROM public.ads
    WHERE id IN (8, 11, 12, 13, 14, 15, 16, 23)
      AND listing_kind = 'buy_sell'
  ) <> 8 THEN
    RAISE EXCEPTION 'the eight advertisements are not all buy_sell';
  END IF;

  IF (
    SELECT count(*)
    FROM public.ads
    WHERE listing_kind = 'commercial'
  ) <> 0 THEN
    RAISE EXCEPTION 'commercial advertisements existed before the campaign test';
  END IF;

  IF (
    SELECT photos = 'data:image/jpeg;base64,PIZZA-MIXER-FIXTURE'
      AND title = 'Impastatrice professionale per pizza e pane'
    FROM public.ads
    WHERE id = 8
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'advertisement 8 photo or title changed';
  END IF;

  IF (
    SELECT photos
    FROM public.ads
    WHERE id = 23
  ) IS DISTINCT FROM
    'https://example.test/storage/v1/object/public/ad-images/fixture-23.webp'
  THEN
    RAISE EXCEPTION 'advertisement 23 storage photo changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.ads
    WHERE id IN (11, 13, 14, 15, 23)
      AND title IN (
        'Test havkar',
        'Havkar test',
        'Test without image',
        'HAVKAR Test Ad'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'a test advertisement title changed';
  END IF;

  IF (
    SELECT count(*) FROM public.ad_saves
  ) <> 4
  OR (
    SELECT count(*)
    FROM public.ad_saves
    WHERE ad_id IN (8, 13, 15, 16)
  ) <> 4 THEN
    RAISE EXCEPTION 'the four favorites changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.conversations
    WHERE ad_id = 8
  ) <> 1 THEN
    RAISE EXCEPTION 'the conversation for advertisement 8 changed';
  END IF;
END
$preserve$;

DO $search$
DECLARE
  buy_sell_hits integer;
  commercial_hits integer;
BEGIN
  SELECT count(*)
  INTO buy_sell_hits
  FROM public.ads
  WHERE listing_kind = 'buy_sell'
    AND lower(
      concat_ws(
        ' ',
        title,
        category,
        location,
        city,
        description
      )
    ) LIKE '%pizza%';

  SELECT count(*)
  INTO commercial_hits
  FROM public.ads
  WHERE listing_kind = 'commercial'
    AND lower(coalesce(title, '')) LIKE '%pizza%';

  IF buy_sell_hits <> 2 OR commercial_hits <> 0 THEN
    RAISE EXCEPTION
      'pizza search returned % buy_sell rows and % commercial rows',
      buy_sell_hits,
      commercial_hits;
  END IF;
END
$search$;

SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  false
);

SET ROLE authenticated;

INSERT INTO public.ads (
  title,
  category,
  price,
  location,
  description,
  user_id,
  photos,
  status
)
VALUES (
  'Fresh listing',
  'Other',
  3,
  'Crotone',
  'Created after separation',
  '11111111-1111-4111-8111-111111111111',
  '[]',
  'active'
);

UPDATE public.ads
SET
  title = 'Professional Pizza Oven maintained',
  description = 'Professional pizza oven in good working condition.'
WHERE id = 12
  AND user_id = '11111111-1111-4111-8111-111111111111';

DO $reject_kind_change$
BEGIN
  UPDATE public.ads
  SET listing_kind = 'commercial'
  WHERE id = 12;

  RAISE EXCEPTION 'listing kind update was accepted';
EXCEPTION
  WHEN SQLSTATE '42501' THEN
    NULL;
END
$reject_kind_change$;

SELECT set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  false
);

DO $reject_commercial_insert$
BEGIN
  INSERT INTO public.ads (
    title,
    category,
    price,
    location,
    description,
    user_id,
    photos,
    status,
    listing_kind
  )
  VALUES (
    'Unauthorized commercial',
    'restaurant',
    1,
    'Crotone',
    'Should not be stored',
    '22222222-2222-4222-8222-222222222222',
    '[]',
    'active',
    'commercial'
  );

  RAISE EXCEPTION 'authenticated commercial insert was accepted';
EXCEPTION
  WHEN SQLSTATE '42501' THEN
    NULL;
END
$reject_commercial_insert$;

UPDATE public.ads
SET title = 'Taken over'
WHERE id = 12;

SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  false
);

DO $protect_ad_eight$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.ads
  WHERE id = 8;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> 0 THEN
    RAISE EXCEPTION 'advertisement 8 was deleted despite its dependencies';
  END IF;
END
$protect_ad_eight$;

RESET ROLE;

DO $create_edit_result$
BEGIN
  IF (
    SELECT listing_kind = 'buy_sell'
      AND photos = '[]'
      AND user_id = '11111111-1111-4111-8111-111111111111'
    FROM public.ads
    WHERE title = 'Fresh listing'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'new post-ad listing was not stored as buy_sell';
  END IF;

  IF (
    SELECT title = 'Professional Pizza Oven maintained'
      AND listing_kind = 'buy_sell'
      AND photos = 'data:image/jpeg;base64,OVEN-FIXTURE'
      AND status IS NULL
    FROM public.ads
    WHERE id = 12
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'owner edit changed the photo, status, or listing kind';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ads
    WHERE title IN ('Unauthorized commercial', 'Taken over')
  ) THEN
    RAISE EXCEPTION 'a forbidden listing change was stored';
  END IF;

  IF (
    SELECT count(*) FROM public.ads WHERE id = 8
  ) <> 1
  OR (
    SELECT count(*) FROM public.ad_saves
  ) <> 4
  OR (
    SELECT count(*) FROM public.conversations WHERE ad_id = 8
  ) <> 1 THEN
    RAISE EXCEPTION 'delete protection lost a favorite, conversation, or advertisement 8';
  END IF;
END
$create_edit_result$;

SET ROLE service_role;

INSERT INTO public.ads (
  id,
  title,
  category,
  price,
  location,
  description,
  user_id,
  photos,
  status,
  listing_kind
)
VALUES (
  100,
  'Pizza sponsorship',
  'restaurant',
  NULL,
  'Crotone',
  'Future campaign fixture',
  '11111111-1111-4111-8111-111111111111',
  'https://example.test/storage/v1/object/public/ad-images/campaign-100.webp',
  'active',
  'commercial'
);

RESET ROLE;

DO $separated_search$
DECLARE
  marketplace_hits integer;
  commercial_hits integer;
  visible_to_anon integer;
BEGIN
  SELECT count(*)
  INTO marketplace_hits
  FROM public.ads
  WHERE listing_kind = 'buy_sell'
    AND lower(concat_ws(' ', title, description)) LIKE '%pizza%';

  SELECT count(*)
  INTO commercial_hits
  FROM public.ads
  WHERE listing_kind = 'commercial'
    AND lower(concat_ws(' ', title, description)) LIKE '%pizza%';

  IF marketplace_hits <> 2 OR commercial_hits <> 1 THEN
    RAISE EXCEPTION
      'separated pizza search returned % buy_sell and % commercial',
      marketplace_hits,
      commercial_hits;
  END IF;

  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*)
  INTO visible_to_anon
  FROM public.ads
  WHERE id IN (8, 12, 100);

  IF visible_to_anon <> 3 THEN
    RAISE EXCEPTION
      'anonymous readers lost a public advertisement, saw % of 3',
      visible_to_anon;
  END IF;

  IF (
    SELECT count(*)
    FROM public.ads
    WHERE listing_kind = 'commercial'
      AND id <> 100
  ) <> 0 THEN
    RAISE EXCEPTION 'an existing advertisement became commercial';
  END IF;
END
$separated_search$;

RESET ROLE;
