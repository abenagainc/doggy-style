-- Re-interest cooldown (docs/product/07 §12, amended by owner decision 2026-08-24):
-- After a decline, the same dog may express interest again once a cooldown expires.
-- Testing default: 5 minutes; production target: >= 1 week. Configured via app.reinterest_cooldown_minutes.

-- The one-row-per-direction unique index blocked re-interest forever.
-- Replace with a partial index: only one ACTIVE interest per direction.
drop index if exists interests_one_per_direction_idx;
create unique index interests_active_direction_idx on public.interests(source_dog_id, target_dog_id) where status = 'ACTIVE';

-- Cooldown timestamp on the declined row.
alter table public.interests add column if not exists cooldown_until timestamptz;

-- Stamp the cooldown when an interest is DECLINED.
create or replace function public.stamp_interest_cooldown() returns trigger
language plpgsql security definer set search_path = public as $$
declare minutes int;
begin
  if new.status = 'DECLINED' and coalesce(old.status, '') <> 'DECLINED' then
    begin
      select nullif(current_setting('app.reinterest_cooldown_minutes'), '')::int into minutes;
    exception when others then minutes := null;
    end;
    new.cooldown_until := now() + make_interval(mins => coalesce(minutes, 5));
  end if;
  return new;
end;
$$;
create trigger interests_stamp_cooldown before update of status on public.interests
for each row when (new.status = 'DECLINED') execute function public.stamp_interest_cooldown();

-- Eligibility RPC: hide declined candidates until their cooldown expires, then allow again.
-- (drop first: the return type changed since 00500, and CREATE OR REPLACE cannot alter it)
drop function if exists public.eligible_candidates(uuid);
create function public.eligible_candidates(p_source_dog_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  sex public.dog_sex,
  date_of_birth date,
  breed text,
  location text,
  photo_path text
)
language sql stable security definer set search_path = public as $$
  select d.id, d.owner_id, d.name, d.sex, d.date_of_birth, d.breed, d.location,
    (select p.storage_path from public.dog_photos p where p.dog_id = d.id order by p.sort_order, p.created_at limit 1) as photo_path
  from public.dogs d
  join public.owners o on o.id = d.owner_id
  where d.id <> p_source_dog_id
    and d.owner_id <> (select owner_id from public.dogs where id = p_source_dog_id)
    and d.archived_at is null
    and d.availability_status = 'AVAILABLE'
    and d.profile_status = 'COMPLETE'
    and d.breeding_enabled = true
    and o.verification_status = 'APPROVED'
    and exists (select 1 from public.dog_photos p where p.dog_id = d.id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select owner_id from public.dogs where id = p_source_dog_id) and b.blocked_id = d.owner_id)
         or (b.blocker_id = d.owner_id and b.blocked_id = (select owner_id from public.dogs where id = p_source_dog_id))
    )
    and not exists (
      select 1 from public.candidate_passes cp
      where cp.source_dog_id = p_source_dog_id and cp.target_dog_id = d.id
    )
    -- active interests always hide the candidate...
    and not exists (
      select 1 from public.interests i
      where i.source_dog_id = p_source_dog_id and i.target_dog_id = d.id and i.status = 'ACTIVE'
    )
    -- ...declined ones hide only until the cooldown lapses
    and not exists (
      select 1 from public.interests i
      where i.source_dog_id = p_source_dog_id and i.target_dog_id = d.id
        and i.status = 'DECLINED' and i.cooldown_until > now()
    )
    and not exists (
      select 1 from public.connections c
      where c.status = 'ACTIVE'
        and ((c.lower_dog_id = p_source_dog_id and c.higher_dog_id = d.id)
          or (c.lower_dog_id = d.id and c.higher_dog_id = p_source_dog_id))
    );
$$;

-- Interest guard: allow re-send after cooldown instead of blocking forever.
create or replace function public.assert_no_block_between() returns trigger
language plpgsql security definer set search_path = public as $$
declare src_owner uuid; tgt_owner uuid;
begin
  select d.owner_id into src_owner from public.dogs d where d.id = new.source_dog_id;
  select d.owner_id into tgt_owner from public.dogs d where d.id = new.target_dog_id;
  if src_owner = tgt_owner then return new; end if;
  if exists (select 1 from public.blocks b where (b.blocker_id = src_owner and b.blocked_id = tgt_owner) or (b.blocker_id = tgt_owner and b.blocked_id = src_owner)) then
    raise exception 'A block prevents interaction between these owners';
  end if;
  return new;
end;
$$;

-- Replaces the P0 hard block: re-insert after DECLINED allowed only once cooldown has lapsed.
create or replace function public.assert_reinterest_cooldown() returns trigger
language plpgsql security definer set search_path = public as $$
declare prior timestamptz;
begin
  select max(cooldown_until) into prior
  from public.interests i
  where i.source_dog_id = new.source_dog_id and i.target_dog_id = new.target_dog_id and i.status = 'DECLINED';
  if prior is not null and prior > now() then
    raise exception 'Re-interest cooldown still in effect for this pair';
  end if;
  return new;
end;
$$;
drop trigger if exists interests_cooldown_guard on public.interests;
create trigger interests_cooldown_guard before insert on public.interests
for each row execute function public.assert_reinterest_cooldown();
