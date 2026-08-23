-- Fix: conversation INSERT policy was missing entirely (only SELECT existed).
-- The client creates the conversation lazily when opening a connection's chat,
-- so participants must be allowed to create it.

drop policy if exists "participants create conversations" on public.conversations;
create policy "participants create conversations" on public.conversations for insert
  with check (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
    )
  );
