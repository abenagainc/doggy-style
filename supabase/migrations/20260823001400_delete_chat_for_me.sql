-- Delete chat "just for me": per-owner hidden flag instead of destructive wipe.
-- The other owner keeps their copy. Replaces migration 01300's destructive approach.

-- Per-owner hide flags for conversations (mirrors connection archive pattern).
alter table public.conversations
  add column if not exists deleted_by_a boolean not null default false,
  add column if not exists deleted_by_b boolean not null default false;

-- delete_connection_chat now hides the chat for the calling owner only.
create or replace function public.delete_connection_chat(p_connection_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare is_a boolean;
begin
  if not public.is_connection_participant(p_connection_id, auth.uid()) then
    raise exception 'Not a participant of this connection';
  end if;
  select (owner_a_id = auth.uid()) into is_a from public.connections where id = p_connection_id;
  update public.conversations
  set deleted_by_a = case when is_a then true else deleted_by_a end,
      deleted_by_b = case when is_a then deleted_by_b else true end
  where connection_id = p_connection_id;
end;
$$;

-- Opening a chat again (after deleting) unhides it for that owner.
create or replace function public.undelete_connection_chat(p_connection_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare is_a boolean;
begin
  if not public.is_connection_participant(p_connection_id, auth.uid()) then
    raise exception 'Not a participant of this connection';
  end if;
  select (owner_a_id = auth.uid()) into is_a from public.connections where id = p_connection_id;
  update public.conversations
  set deleted_by_a = case when is_a then false else deleted_by_a end,
      deleted_by_b = case when is_a then deleted_by_b else false end
  where connection_id = p_connection_id;
end;
$$;
grant execute on function public.undelete_connection_chat(uuid) to authenticated;

-- list_my_connections: expose whether MY conversation is hidden.
drop function if exists public.list_my_connections();
create function public.list_my_connections()
returns table (
  id uuid,
  status text,
  my_dog_id uuid,
  other_dog_id uuid,
  other_dog_name text,
  archived boolean,
  chat_deleted boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.status,
         case when da.owner_id = auth.uid() then c.lower_dog_id else c.higher_dog_id end as my_dog_id,
         case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end as other_dog_id,
         case when da.owner_id = auth.uid() then db.name else da.name end as other_dog_name,
         case when da.owner_id = auth.uid() then c.archived_by_a else c.archived_by_b end as archived,
         coalesce(v.deleted_by_a and da.owner_id = auth.uid(), false) or coalesce(v.deleted_by_b and db.owner_id = auth.uid(), false) as chat_deleted,
         c.created_at
  from public.connections c
  join public.dogs da on da.id = c.lower_dog_id
  join public.dogs db on db.id = c.higher_dog_id
  left join public.conversations v on v.connection_id = c.id
  where c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid()
  order by c.created_at desc;
$$;

-- Messages/conversations SELECT policies: respect per-owner deletion.
-- (A hidden chat's messages stay in the DB but are unreadable until undeleted.)
drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations for select
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
    )
    and not (
      (deleted_by_a = true and exists (select 1 from public.connections c2 where c2.id = connection_id and c2.owner_a_id = auth.uid()))
      or (deleted_by_b = true and exists (select 1 from public.connections c3 where c3.id = connection_id and c3.owner_b_id = auth.uid()))
    )
  );
