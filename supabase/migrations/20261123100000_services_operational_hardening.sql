-- Services operational hardening:
-- 1) Prevent double-booking of the same provider slot for active statuses.
-- 2) Keep settlement event uniqueness (already present).

CREATE UNIQUE INDEX IF NOT EXISTS service_bookings_provider_slot_active_uidx
ON public.service_bookings (provider_id, booking_date, booking_time)
WHERE status IN (
  'pending',
  'price_proposed',
  'accepted',
  'completion_requested',
  'completed',
  'in_review',
  'disputed'
);
