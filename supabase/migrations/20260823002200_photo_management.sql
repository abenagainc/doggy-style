-- M11 Profile polish: photo reorder + cover selection, vaccine expiry reminders.

-- Extend the notification enum for vaccine reminders.
alter type public.notification_type add value if not exists 'VACCINE_DUE';

-- 1. Cover photo: is_cover flag on dog_photos (one per dog via partial unique index).
alter table public.dog_photos add column if not exists is_cover boolean not null default false;
create unique index if not exists dog_photos_cover_idx on public.dog_photos(dog_id) where is_cover;

-- Set cover: clears other covers on the same dog first. Owner-only.
create or replace function public.set_dog_cover(p_photo_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare dog uuid; owner uuid;
begin
  select dp.dog_id, d.owner_id into dog, owner from public.dog_photos dp join public.dogs d on d.id = dp.dog_id where dp.id = p_photo_id;
  if owner is null or owner <> auth.uid() then raise exception 'Not your photo'; end if;
  update public.dog_photos set is_cover = false where dog_id = dog;
  update public.dog_photos set is_cover = true where id = p_photo_id;
end;
$$;

-- Reorder: swap sort_order with an adjacent photo (direction +1 or -1).
create or replace function public.move_dog_photo(p_photo_id uuid, p_direction int)
returns void
language plpgsql security definer set search_path = public as $$
declare mine record; other record;
begin
  select dp.*, d.owner_id as owner_id into mine
  from public.dog_photos dp join public.dogs d on d.id = dp.dog_id
  where dp.id = p_photo_id;
  if mine.owner_id is null or mine.owner_id <> auth.uid() then raise exception 'Not your photo'; end if;

  if p_direction > 0 then
    select * into other from public.dog_photos
    where dog_id = mine.dog_id and sort_order > mine.sort_order order by sort_order asc limit 1;
  else
    select * into other from public.dog_photos
    where dog_id = mine.dog_id and sort_order < mine.sort_order order by sort_order desc limit 1;
  end if;

  if other.id is null then return; end if; -- already at edge
  update public.dog_photos set sort_order = other.sort_order where id = mine.id;
  update public.dog_photos set sort_order = mine.sort_order where id = other.id;
end;
$$;

grant execute on function public.set_dog_cover(uuid) to authenticated;
grant execute on function public.move_dog_photo(uuid, int) to authenticated;

-- 2. Vaccine expiry reminders: daily-checkable via notification, fired when due within 14 days
--    and not already reminded for that due date.
create or replace function public.check_vaccine_reminders()
returns int
language plpgsql security definer set search_path = public as $$
declare inserted int := 0; v record; owner uuid;
begin
  for v in
    select dv.id, dv.dog_id, dv.vaccine_name, dv.next_due, d.owner_id
    from public.dog_vaccinations dv
    join public.dogs d on d.id = dv.dog_id
    where dv.next_due is not null
      and dv.next_due <= current_date + 14
      and not exists (
        select 1 from public.notifications n
        where n.owner_id = d.owner_id
          and n.dog_id = dv.dog_id
          and n.type = 'VACCINE_DUE'
          and n.payload->>'vaccinationId' = dv.id::text
      )
  loop
    insert into public.notifications (owner_id, dog_id, type, payload)
    values (v.owner_id, v.dog_id, 'VACCINE_DUE', jsonb_build_object(
      'vaccinationId', v.id::text,
      'vaccineName', v.vaccine_name,
      'dueDate', v.next_due::text
    ));
    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;


-- eligible_candidates / list_passed_dogs prefer the cover photo.
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
  photo_path text,
  rank_score numeric
)
language sql stable security definer set search_path = public as $$
  with src as (
    select d.id, d.owner_id, d.location, d.sex,
           p.required_breeds, p.preferred_breeds, p.max_distance_km
    from public.dogs d
    left join public.dog_matching_preferences p on p.dog_id = d.id
    where d.id = p_source_dog_id
  )
  select d.id, d.owner_id, d.name, d.sex, d.date_of_birth, d.breed, d.location,
    coalesce(
      (select p.storage_path from public.dog_photos p where p.dog_id = d.id and p.is_cover limit 1),
      (select p.storage_path from public.dog_photos p where p.dog_id = d.id order by p.sort_order, p.created_at limit 1)
    ),
    (
      public.rank_weight('rank_weight_breed') * case
        when src.required_breeds @> array[d.breed] then 1.0
        when src.preferred_breeds @> array[d.breed] then 0.7
        else 0.0 end
      +
      public.rank_weight('rank_weight_distance') * case
        when src.location ~ '^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$'
         and d.location ~ '^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$'
        then greatest(0.0, least(1.0,
          1.0 - (
            6371 * 2 * asin(sqrt(
              power(sin(radians((split_part(d.location,',',1))::numeric - (split_part(src.location,',',1))::numeric) / 2), 2) +
              cos(radians((split_part(src.location,',',1))::numeric)) *
              cos(radians((split_part(d.location,',',1))::numeric)) *
              power(sin(radians((split_part(d.location,',',2))::numeric - (split_part(src.location,',',2))::numeric) / 2), 2)
            )) / 100.0
          )))
        else 0.5 end
      +
      public.rank_weight('rank_weight_verification') * public.verification_score(d.owner_id)
    ) as rank_score
  from public.dogs d
  join src on true
  join public.owners o on o.id = d.owner_id
  where d.id <> p_source_dog_id
    and d.owner_id <> src.owner_id
    and d.archived_at is null
    and d.availability_status = 'AVAILABLE'
    and d.profile_status = 'COMPLETE'
    and d.breeding_enabled = true
    and o.verification_status = 'APPROVED'
    and exists (select 1 from public.dog_photos p where p.dog_id = d.id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = src.owner_id and b.blocked_id = d.owner_id)
         or (b.blocker_id = d.owner_id and b.blocked_id = src.owner_id)
    )
    and not exists (
      select 1 from public.candidate_passes cp
      where cp.source_dog_id = p_source_dog_id and cp.target_dog_id = d.id
    )
    and not exists (
      select 1 from public.interests i
      where i.source_dog_id = p_source_dog_id and i.target_dog_id = d.id and i.status = 'ACTIVE'
    )
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
    )
  order by rank_score desc, d.name asc;
$$;

grant execute on function public.eligible_candidates(uuid) to authenticated;
