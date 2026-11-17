-- Optional geographic coordinates for marketplace modules.
-- Never invent values; application geocodes from user-provided addresses/locations.

alter table if exists public.ads
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table if exists public.jobs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table if exists public.services
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table if exists public.marketplace_listings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table if exists public.delivery_requests
  add column if not exists pickup_latitude double precision,
  add column if not exists pickup_longitude double precision,
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision;

comment on column public.ads.latitude is 'Optional listing latitude from validated geocode; null when unknown.';
comment on column public.jobs.latitude is 'Optional on-site job latitude; leave null for remote jobs.';
comment on column public.services.latitude is 'Optional provider/service area latitude; protect private residences in UI.';
