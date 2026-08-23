-- Discovery feed must be server-authoritative (AGENTS.md; DECISIONS.md #1/#2).
-- RLS correctly hides other owners' verification_status from clients, so the client
-- cannot evaluate candidate eligibility itself. This security-definer function
-- returns only the eligible candidate set for a given source dog.

create or replace function public.eligible_candidates(p_source_dog_id uuid)
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
    and not exists (
      select 1 from public.interests i
      where i.source_dog_id = p_source_dog_id and i.target_dog_id = d.id and i.status in ('ACTIVE','DECLINED')
    )
    and not exists (
      select 1 from public.connections c
      where c.status = 'ACTIVE'
        and ((c.lower_dog_id = p_source_dog_id and c.higher_dog_id = d.id)
          or (c.lower_dog_id = d.id and c.higher_dog_id = p_source_dog_id))
    );
$$;

grant execute on function public.eligible_candidates(uuid) to authenticated;
