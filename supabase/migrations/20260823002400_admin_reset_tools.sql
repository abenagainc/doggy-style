-- Admin testing tools: reset matching data for a single entity.
-- These exist so stuck test states can always be cleared. Staff-only.

-- Reset for one DOG: removes its interests (both directions), passes, screening
-- Q&A, and any connections it participates in (with their conversations/messages).
create or replace function public.admin_reset_dog_matching(p_dog_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare stats jsonb; dog_owner uuid;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select owner_id into dog_owner from public.dogs where id = p_dog_id;
  if dog_owner is null then raise exception 'Dog not found'; end if;

  select jsonb_build_object(
    'interests_removed', count(*) from public.interests
      where source_dog_id = p_dog_id or target_dog_id = p_dog_id,
    'passes_removed', count(*) from public.candidate_passes
      where source_dog_id = p_dog_id or target_dog_id = p_dog_id,
    'connections_closed', count(*) from public.connections
      where lower_dog_id = p_dog_id or higher_dog_id = p_dog_id
  ) into stats;

  -- conversations + messages of affected connections
  delete from public.messages where conversation_id in (
    select c2.id from public.conversations c2
    join public.connections c on c.id = c2.connection_id
    where c.lower_dog_id = p_dog_id or c.higher_dog_id = p_dog_id
  );
  delete from public.conversations where connection_id in (
    select id from public.connections
    where lower_dog_id = p_dog_id or higher_dog_id = p_dog_id
  );
  delete from public.connection_proceed_confirmations where connection_id in (
    select id from public.connections
    where lower_dog_id = p_dog_id or higher_dog_id = p_dog_id
  );
  delete from public.screening_answers where connection_id in (
    select id from public.connections
    where lower_dog_id = p_dog_id or higher_dog_id = p_dog_id
  );
  delete from public.connections
    where lower_dog_id = p_dog_id or higher_dog_id = p_dog_id;
  delete from public.interests
    where source_dog_id = p_dog_id or target_dog_id = p_dog_id;
  delete from public.candidate_passes
    where source_dog_id = p_dog_id or target_dog_id = p_dog_id;
  -- notifications tied to this dog
  delete from public.notifications where dog_id = p_dog_id;

  return stats;
end;
$$;

-- Reset for an OWNER: nukes all matching data across every dog they own.
create or replace function public.admin_reset_owner_matching(p_owner_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare stats jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if not exists (select 1 from public.owners where id = p_owner_id) then
    raise exception 'Owner not found';
  end if;

  with affected as (
    select id from public.dogs where owner_id = p_owner_id
  )
  select jsonb_build_object(
    'interests_removed', count(*) from public.interests
      where source_dog_id in (select id from affected) or target_dog_id in (select id from affected),
    'passes_removed', count(*) from public.candidate_passes
      where source_dog_id in (select id from affected) or target_dog_id in (select id from affected),
    'connections_closed', count(*) from public.connections
      where lower_dog_id in (select id from affected) or higher_dog_id in (select id from affected),
    'messages_removed', count(*) from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
      join public.connections c on c.id = cv.connection_id
      where c.lower_dog_id in (select id from affected) or c.higher_dog_id in (select id from affected)
  ) into stats;

  -- messages first (depend on conversations), then the rest
  delete from public.messages where conversation_id in (
    select cv.id from public.conversations cv
    join public.connections c on c.id = cv.connection_id
    join public.dogs dl on dl.id = c.lower_dog_id
    join public.dogs dh on dh.id = c.higher_dog_id
    where dl.owner_id = p_owner_id or dh.owner_id = p_owner_id
  );
  delete from public.conversations where connection_id in (
    select c.id from public.connections c
    join public.dogs dl on dl.id = c.lower_dog_id
    join public.dogs dh on dh.id = c.higher_dog_id
    where dl.owner_id = p_owner_id or dh.owner_id = p_owner_id
  );
  delete from public.connection_proceed_confirmations where connection_id in (
    select c.id from public.connections c
    join public.dogs dl on dl.id = c.lower_dog_id
    join public.dogs dh on dh.id = c.higher_dog_id
    where dl.owner_id = p_owner_id or dh.owner_id = p_owner_id
  );
  delete from public.screening_answers sa
    using public.connections c
    join public.dogs dl on dl.id = c.lower_dog_id
    join public.dogs dh on dh.id = c.higher_dog_id
    where sa.connection_id = c.id and (dl.owner_id = p_owner_id or dh.owner_id = p_owner_id);
  delete from public.connections c
    using public.dogs dl, public.dogs dh
    where ((c.lower_dog_id = dl.id and dl.owner_id = p_owner_id)
        or (c.higher_dog_id = dh.id and dh.owner_id = p_owner_id));
  delete from public.interests i
    using public.dogs d
    where ((i.source_dog_id = d.id or i.target_dog_id = d.id) and d.owner_id = p_owner_id);
  delete from public.candidate_passes cp
    using public.dogs d
    where ((cp.source_dog_id = d.id or cp.target_dog_id = d.id) and d.owner_id = p_owner_id);
  delete from public.notifications where owner_id = p_owner_id;

  return stats;
end;
$$;

-- Staff: list all dogs (for the reset tool dropdown).
create or replace function public.admin_list_dogs()
returns table (id uuid, name text, owner_id uuid, owner_name text)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.owner_id, coalesce(o.display_name, o.id::text)
  from public.dogs d join public.owners o on o.id = d.owner_id
  where d.archived_at is null and public.is_staff()
  order by o.display_name, d.name;
$$;
grant execute on function public.admin_list_dogs() to authenticated;

grant execute on function public.admin_reset_dog_matching(uuid) to authenticated;
grant execute on function public.admin_reset_owner_matching(uuid) to authenticated;
