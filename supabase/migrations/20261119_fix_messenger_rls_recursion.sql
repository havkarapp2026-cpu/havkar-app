-- Fix conversations <-> participants RLS recursion via security definer helper.
create or replace function public.havkar_is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = cid and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.conversations c
    where c.id = cid and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  );
$$;
