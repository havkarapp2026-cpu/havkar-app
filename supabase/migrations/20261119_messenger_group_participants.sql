-- Additive group support for HAVKAR Messenger (keeps existing 1:1 rows intact).
-- Applied to production project gispovnciifgikvgpzck via Owner execution order 2026-11-19.
alter table public.conversations
  add column if not exists is_group boolean not null default false;
alter table public.conversations
  add column if not exists title text;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;
