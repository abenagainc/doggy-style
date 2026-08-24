-- Admin expansion: dynamic cooldown wiring, user management, blocks overview, stats.

-- 1. Cooldown trigger now reads the platform_settings value (managed from admin UI),
--    falling back to app.reinterest_cooldown_minutes, then 5.
create or replace function public.stamp_interest_cooldown() returns trigger
language plpgsql security definer set search_path = public as $$
declare minutes int;
begin
  select coalesce(nullif(value, '')::int, null) into minutes
  from public.platform_settings where key = 'reinterest_cooldown_minutes';
  if minutes is null then
    begin
      select nullif(current_setting('app.reinterest_cooldown_minutes'), '')::int into minutes;
    exception when others then minutes := null;
    end;
  end if;
  new.cooldown_until := case when coalesce(minutes, 0) <= 0 then null
                             else now() + make_interval(mins => minutes) end;
  return new;
end;
$$;

-- Recreate the trigger to pick up the new function body (drop guards against drift).
drop trigger if exists interests_stamp_cooldown on public.interests;
create trigger interests_stamp_cooldown before update of status on public.interests
for each row when (new.status = 'DECLINED') execute function public.stamp_interest_cooldown();

-- 2. User management ----------------------------------------------------------------

create or replace function public.admin_list_owners()
returns table (
  owner_id uuid,
  display_name text,
  dog_count bigint,
  verification text,
  created_at timestamptz,
  is_staff boolean
)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, count(d.id), o.verification_status::text, min(o.created_at),
         exists (select 1 from public.admin_staff s where s.owner_id = o.id)
  from public.owners o
  left join public.dogs d on d.owner_id = o.id and d.archived_at is null
  where public.is_staff()
  group by o.id, o.display_name, o.verification_status
  order by min(o.created_at) desc;
$$;

-- Deactivate / reactivate an owner: archived dogs hide them from discovery.
create or replace function public.admin_set_owner_active(p_owner_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if p_active then
    update public.dogs set archived_at = null where owner_id = p_owner_id;
  else
    update public.dogs set archived_at = now() where owner_id = p_owner_id and archived_at is null;
    -- also close their open connections
    update public.connections set status = 'CLOSED'
    where status = 'ACTIVE' and (owner_a_id = p_owner_id or owner_b_id = p_owner_id);
  end if;
end;
$$;

-- Set verification status (APPROVED / PENDING / REJECTED per owners table enum).
create or replace function public.admin_set_verification(p_owner_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  update public.owners set verification_status = p_status::public.verification_status where id = p_owner_id;
end;
$$;

grant execute on function public.admin_list_owners() to authenticated;
grant execute on function public.admin_set_owner_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_verification(uuid, text) to authenticated;

-- 3. Blocks overview ------------------------------------------------------------------

create or replace function public.admin_list_blocks()
returns table (
  blocker_owner_id uuid,
  blocked_owner_id uuid,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.blocker_id, b.blocked_id, b.created_at
  from public.blocks b
  where public.is_staff()
  order by b.created_at desc;
$$;
grant execute on function public.admin_list_blocks() to authenticated;

-- 4. Stats -----------------------------------------------------------------------------

create or replace function public.admin_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owners', (select count(*) from public.owners),
    'dogs', (select count(*) from public.dogs where archived_at is null),
    'active_interests', (select count(*) from public.interests where status = 'ACTIVE'),
    'declined_interests', (select count(*) from public.interests where status = 'DECLINED'),
    'connections_active', (select count(*) from public.connections where status = 'ACTIVE'),
    'connections_proceeding', (select count(*) from public.connections where status = 'PROCEEDING'),
    'reports_open', (select count(*) from public.reports where status = 'OPEN'),
    'blocks', (select count(*) from public.blocks)
  );
$$;
grant execute on function public.admin_stats() to authenticated;
