-- Cover-photo paths in likes/connections listings (mini cards show images).

-- Helper: cover photo path for a dog (falls back to first by sort order).
create or replace function public.dog_cover_photo(p_dog_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.storage_path from public.dog_photos p where p.dog_id = p_dog_id and p.is_cover limit 1),
    (select p.storage_path from public.dog_photos p where p.dog_id = p_dog_id order by p.sort_order, p.created_at limit 1)
  );
$$;

-- list_interests_view: add the other dog's cover photo to received/sent.
drop view if exists public.list_interests_view;
create view public.list_interests_view with (security_invoker = true) as
select
  i.id,
  i.source_dog_id,
  i.target_dog_id,
  i.strength,
  i.status,
  i.created_at,
  sd.owner_id as source_owner_id,
  td.owner_id as target_owner_id,
  sd.name as source_dog_name,
  td.name as target_dog_name,
  public.dog_cover_photo(sd.id) as source_cover_path,
  public.dog_cover_photo(td.id) as target_cover_path
from public.interests i
join public.dogs sd on sd.id = i.source_dog_id
join public.dogs td on td.id = i.target_dog_id;

grant select on public.list_interests_view to authenticated;

-- list_my_connections: add other dog's cover photo.
drop function if exists public.list_my_connections();
create function public.list_my_connections()
returns table (
  id uuid,
  status text,
  my_dog_id uuid,
  other_dog_id uuid,
  other_dog_name text,
  other_dog_cover text,
  archived boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.status,
         case when da.owner_id = auth.uid() then c.lower_dog_id else c.higher_dog_id end as my_dog_id,
         case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end as other_dog_id,
         case when da.owner_id = auth.uid() then db.name else da.name end as other_dog_name,
         public.dog_cover_photo(case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end) as other_dog_cover,
         case when da.owner_id = auth.uid() then c.archived_by_a else c.archived_by_b end as archived,
         c.created_at
  from public.connections c
  join public.dogs da on da.id = c.lower_dog_id
  join public.dogs db on db.id = c.higher_dog_id
  where c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid()
  order by c.created_at desc;
$$;
