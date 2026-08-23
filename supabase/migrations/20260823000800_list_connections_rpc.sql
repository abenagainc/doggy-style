-- Connections list naming: RLS hides other owners' dog rows, so the client cannot
-- resolve the OTHER party's dog name (it kept showing the user's own dog).
-- Return each participant owner's connections with the other dog's name server-side.

create or replace function public.list_my_connections()
returns table (
  id uuid,
  status text,
  my_dog_id uuid,
  other_dog_id uuid,
  other_dog_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.status,
         case when da.owner_id = auth.uid() then c.lower_dog_id else c.higher_dog_id end as my_dog_id,
         case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end as other_dog_id,
         case when da.owner_id = auth.uid() then db.name else da.name end as other_dog_name,
         c.created_at
  from public.connections c
  join public.dogs da on da.id = c.lower_dog_id
  join public.dogs db on db.id = c.higher_dog_id
  where c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid()
  order by c.created_at desc;
$$;
grant execute on function public.list_my_connections() to authenticated;
