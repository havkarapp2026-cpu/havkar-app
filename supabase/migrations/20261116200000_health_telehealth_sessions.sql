-- Telehealth session metadata only (no media / no clinical content recording).
-- Public clinical sessions remain gated in application code until Owner authorization.

create table if not exists public.health_telehealth_sessions (
  id text primary key,
  appointment_id uuid not null,
  provider_id uuid not null,
  patient_user_id uuid not null,
  modality text not null check (modality in ('voice', 'video')),
  mode text not null check (mode in ('public_clinical', 'authorized_test')),
  status text not null default 'waiting_room',
  recording text not null default 'OFF',
  media_recorded boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz null
);

create index if not exists health_telehealth_sessions_appointment_idx
  on public.health_telehealth_sessions (appointment_id);

create index if not exists health_telehealth_sessions_provider_idx
  on public.health_telehealth_sessions (provider_id);

comment on table public.health_telehealth_sessions is
  'Secure telehealth session logs without media or clinical content recording.';
