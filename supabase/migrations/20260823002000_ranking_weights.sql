-- M8 Ranking: weighted candidate ordering, weights managed from the admin app.
-- Score = w_breed·breed_match + w_distance·distance_closeness + w_verification·verification_level
-- All signals normalized 0..1; weights are plain numbers in platform_settings.
-- Ranking is silent (docs/product/11): order changes, cards don't show why.

-- Default weights (seeded once).
insert into public.platform_settings (key, value) values
  ('rank_weight_breed', '1.0'),
  ('rank_weight_distance', '0.6'),
  ('rank_weight_verification', '0.4')
on conflict (key) do nothing;

-- Weight reader with sane fallbacks.
create or replace function public.rank_weight(p_key text)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(value, '')::numeric, 0)
  from public.platform_settings where key = p_key;
$$;

-- Verification level as 0..1 (tier-1 APPROVED = 1 for now; richer tiers in M9).
create or replace function public.verification_score(p_owner_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select case o.verification_status
    when 'APPROVED' then 1.0
    when 'PENDING' then 0.5
    when 'NEEDS_UPDATE' then 0.3
    else 0.0
  end from public.owners o where o.id = p_owner_id;
$$;

-- The ranked feed: same eligibility filters as before, now ORDERED by score.
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
    (select p.storage_path from public.dog_photos p where p.dog_id = d.id order by p.sort_order, p.created_at limit 1),
    -- score: breed (required=1, preferred=0.7, else 0) · distance closeness · verification
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
            -- haversine km / 100km cap: 0km→1.0, 100km+→0.0
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
