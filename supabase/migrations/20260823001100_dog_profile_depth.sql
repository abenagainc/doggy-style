-- Dog profile depth: health, vaccinations, pedigree, temperament (docs/technical/20 §1).
-- Privacy per DECISIONS.md #7: owner-entered summaries visible on candidate profiles via
-- security-definer RPCs; nothing here is directly readable cross-owner.

-- Health summary (owner-entered; evidence/review workflows are P1).
create table public.dog_health (
  dog_id uuid primary key references public.dogs(id) on delete cascade,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  general_health text check (general_health is null or char_length(general_health) <= 2000),
  health_issues text check (health_issues is null or char_length(health_issues) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.dog_vaccinations (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  vaccine_name text not null check (char_length(btrim(vaccine_name)) between 1 and 100),
  date_given date not null check (date_given <= current_date),
  next_due date,
  notes text check (notes is null or char_length(notes) <= 500)
);
create index dog_vaccinations_dog_idx on public.dog_vaccinations(dog_id, date_given desc);

create table public.dog_pedigree (
  dog_id uuid primary key references public.dogs(id) on delete cascade,
  sire_name text check (sire_name is null or char_length(sire_name) <= 100),
  dam_name text check (dam_name is null or char_length(dam_name) <= 100),
  registration_number text check (registration_number is null or char_length(registration_number) <= 100),
  lineage_notes text check (lineage_notes is null or char_length(lineage_notes) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.dog_temperament (
  dog_id uuid primary key references public.dogs(id) on delete cascade,
  energy_level text check (energy_level in ('LOW','MODERATE','HIGH','VERY_HIGH')),
  good_with_children boolean,
  good_with_dogs boolean,
  good_with_cats boolean,
  trainability text check (trainability in ('LOW','MODERATE','HIGH')),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.dog_temperament drop constraint dog_temperament_dog_id_fkey;
alter table public.dog_temperament add constraint dog_temperament_dog_id_fkey
  foreign key (dog_id) references public.dogs(id) on delete cascade;

-- RLS: owners manage their own dogs' sections.
alter table public.dog_health enable row level security;
alter table public.dog_vaccinations enable row level security;
alter table public.dog_pedigree enable row level security;
alter table public.dog_temperament enable row level security;

create policy "owners manage own dog health" on public.dog_health for all
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
create policy "owners manage own dog vaccinations" on public.dog_vaccinations for all
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
create policy "owners manage own dog pedigree" on public.dog_pedigree for all
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
create policy "owners manage own dog temperament" on public.dog_temperament for all
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

-- Candidate detail: server-side fetch of the public-facing profile of an eligible dog.
-- Returns only owner-approved summary fields, never identity or precise data (DECISIONS #7).
create or replace function public.candidate_profile(p_viewer_dog_id uuid, p_candidate_dog_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  viewer_owner uuid;
  candidate public.dogs%rowtype;
  blocked boolean;
  result jsonb;
begin
  select owner_id into viewer_owner from public.dogs where id = p_viewer_dog_id;
  if viewer_owner is null then raise exception 'Viewer dog not found'; end if;

  select * into candidate from public.dogs where id = p_candidate_dog_id;
  if candidate.id is null then raise exception 'Candidate not found'; end if;
  if candidate.owner_id = viewer_owner then raise exception 'Cannot view own dog as a candidate'; end if;

  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = viewer_owner and b.blocked_id = candidate.owner_id)
       or (b.blocker_id = candidate.owner_id and b.blocked_id = viewer_owner)
  ) into blocked;
  if blocked then raise exception 'This profile is unavailable'; end if;

  select jsonb_build_object(
    'name', candidate.name,
    'breed', candidate.breed,
    'sex', candidate.sex,
    'date_of_birth', candidate.date_of_birth,
    'locationBand', null,
    'profileStatus', candidate.profile_status,
    'verificationStatus', (select o.verification_status from public.owners o where o.id = candidate.owner_id),
    'photos', coalesce((
      select jsonb_agg(p.storage_path order by p.sort_order, p.created_at)
      from public.dog_photos p where p.dog_id = candidate.id
    ), '[]'::jsonb),
    'health', (select to_jsonb(h) - 'dog_id' - 'updated_at' from public.dog_health h where h.dog_id = candidate.id),
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object('vaccineName', v.vaccine_name, 'dateGiven', v.date_given, 'nextDue', v.next_due)
                        order by v.date_given desc)
      from public.dog_vaccinations v where v.dog_id = candidate.id
    ), '[]'::jsonb),
    'pedigree', (select to_jsonb(pg) - 'dog_id' - 'updated_at' from public.dog_pedigree pg where pg.dog_id = candidate.id),
    'temperament', (select to_jsonb(t) - 'dog_id' - 'updated_at' from public.dog_temperament t where t.dog_id = candidate.id)
  ) into result;

  return result;
end;
$$;
grant execute on function public.candidate_profile(uuid, uuid) to authenticated;
