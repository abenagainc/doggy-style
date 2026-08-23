-- Fix: interest visibility. The old policy required RLS-visible rows for BOTH dogs,
-- but each owner can only see their own dog — so cross-owner interests were invisible
-- to BOTH participants (insert succeeded, select returned nothing).
-- Fix mirrors the connection pattern: ownership check via a security-definer helper.

create or replace function public.is_interest_participant(p_source_dog_id uuid, p_target_dog_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dogs sd, public.dogs td
    where sd.id = p_source_dog_id and td.id = p_target_dog_id
      and (sd.owner_id = p_uid or td.owner_id = p_uid)
  );
$$;

drop policy if exists "participants read interests" on public.interests;
create policy "participants read interests" on public.interests for select
  using (public.is_interest_participant(source_dog_id, target_dog_id, auth.uid()));

-- Same class of bug for the sent/received lists' join to dog names: the client joins
-- interests -> dogs for the other side's name, but cannot see the other dog's row.
-- Expose a minimal name lookup instead.
create or replace function public.dog_public_name(p_dog_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select name from public.dogs where id = p_dog_id;
$$;
grant execute on function public.dog_public_name(uuid) to authenticated;
grant execute on function public.is_interest_participant(uuid, uuid, uuid) to authenticated;
