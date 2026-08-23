-- Chat archive & delete: per-owner view state on connections.
-- Archive is a per-owner flag (hides from active list; other side unaffected).
-- Delete removes the conversation and its messages for BOTH owners (destructive).

alter table public.connections
  add column if not exists archived_by_a boolean not null default false,
  add column if not exists archived_by_b boolean not null default false;

-- Owner-side helpers
create or replace function public.is_connection_participant(p_connection_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections c
    where c.id = p_connection_id and (c.owner_a_id = p_uid or c.owner_b_id = p_uid)
  );
$$;

-- Archive toggle for the calling owner's side.
create or replace function public.set_connection_archived(p_connection_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare is_a boolean;
begin
  if not public.is_connection_participant(p_connection_id, auth.uid()) then
    raise exception 'Not a participant of this connection';
  end if;
  select (owner_a_id = auth.uid()) into is_a from public.connections where id = p_connection_id;
  update public.connections
  set archived_by_a = case when is_a then p_archived else archived_by_a end,
      archived_by_b = case when is_a then archived_by_b else p_archived end
  where id = p_connection_id;
end;
$$;
grant execute on function public.set_connection_archived(uuid, boolean) to authenticated;

-- Delete chat: wipes conversation + messages. Destructive, participant-only.
create or replace function public.delete_connection_chat(p_connection_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare convo uuid;
begin
  if not public.is_connection_participant(p_connection_id, auth.uid()) then
    raise exception 'Not a participant of this connection';
  end if;
  select id into convo from public.conversations where connection_id = p_connection_id;
  if convo is not null then
    delete from public.messages where conversation_id = convo;
    delete from public.conversations where id = convo;
  end if;
end;
$$;
grant execute on function public.delete_connection_chat(uuid) to authenticated;

-- List RPC: include archive flags relative to the caller.
drop function if exists public.list_my_connections();
create function public.list_my_connections()
returns table (
  id uuid,
  status text,
  my_dog_id uuid,
  other_dog_id uuid,
  other_dog_name text,
  archived boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.status,
         case when da.owner_id = auth.uid() then c.lower_dog_id else c.higher_dog_id end as my_dog_id,
         case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end as other_dog_id,
         case when da.owner_id = auth.uid() then db.name else da.name end as other_dog_name,
         case when da.owner_id = auth.uid() then c.archived_by_a else c.archived_by_b end as archived,
         c.created_at
  from public.connections c
  join public.dogs da on da.id = c.lower_dog_id
  join public.dogs db on db.id = c.higher_dog_id
  where c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid()
  order by c.created_at desc;
$$;
