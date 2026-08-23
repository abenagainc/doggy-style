-- Milestone 2: matching preferences, discovery passes, interests, connections.
-- Server-authoritative: RLS restricts rows to their owners; lifecycle rules live in the domain layer.

create type public.preference_level as enum ('REQUIRED', 'PREFERRED', 'DONT_CARE');
create type public.interest_strength as enum ('NORMAL', 'STRONG');
create type public.interest_status as enum ('ACTIVE', 'WITHDRAWN', 'DECLINED');

-- Matching preferences (docs/product/11; DECISIONS.md #1, #7)
create table public.dog_matching_preferences (
  dog_id uuid primary key references public.dogs(id) on delete cascade,
  required_breeds text[] not null default '{}',
  preferred_breeds text[] not null default '{}',
  age_min_months integer not null default 0 check (age_min_months >= 0),
  age_max_months integer not null default 1200 check (age_max_months >= age_min_months),
  max_distance_km numeric(6,1) not null default 5000 check (max_distance_km > 0),
  updated_at timestamptz not null default now()
);

-- Candidate passes (DECISIONS.md #3): ordered pair, no auto-resurfacing in P0.
create table public.candidate_passes (
  source_dog_id uuid not null references public.dogs(id) on delete cascade,
  target_dog_id uuid not null references public.dogs(id) on delete cascade,
  passed_at timestamptz not null default now(),
  primary key (source_dog_id, target_dog_id),
  constraint pass_targets_differ check (source_dog_id <> target_dog_id)
);
create index candidate_passes_target_idx on public.candidate_passes(target_dog_id);

-- Directional interests (Interest is not Connection).
create table public.interests (
  id uuid primary key default gen_random_uuid(),
  source_dog_id uuid not null references public.dogs(id) on delete cascade,
  target_dog_id uuid not null references public.dogs(id) on delete cascade,
  strength public.interest_strength not null,
  status public.interest_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interest_dogs_differ check (source_dog_id <> target_dog_id)
);
-- One interest per directional pair regardless of historical status (P0 re-interest is blocked after decline).
create unique index interests_one_per_direction_idx on public.interests(source_dog_id, target_dog_id);
create index interests_target_status_idx on public.interests(target_dog_id, status);
create index interests_source_status_idx on public.interests(source_dog_id, status);

-- Connections (DECISIONS.md #4): canonical unordered dog pair, one open connection max.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  lower_dog_id uuid not null references public.dogs(id) on delete cascade,
  higher_dog_id uuid not null references public.dogs(id) on delete cascade,
  owner_a_id uuid not null references public.owners(id) on delete cascade,
  owner_b_id uuid not null references public.owners(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_dogs_differ check (lower_dog_id <> higher_dog_id),
  constraint connection_owners_differ check (owner_a_id <> owner_b_id)
);
-- Database-level uniqueness: at most one non-closed connection per unordered pair (partial unique index).
create unique index connections_open_pair_idx on public.connections(lower_dog_id, higher_dog_id) where status = 'ACTIVE';
create index connections_owner_a_idx on public.connections(owner_a_id);
create index connections_owner_b_idx on public.connections(owner_b_id);

create trigger dog_matching_preferences_set_updated_at before update on public.dog_matching_preferences for each row execute function public.set_updated_at();
create trigger interests_set_updated_at before update on public.interests for each row execute function public.set_updated_at();
create trigger connections_set_updated_at before update on public.connections for each row execute function public.set_updated_at();

-- Guard: an ACTIVE interest requires both dogs to be currently eligible (defense in depth; domain checks first).
create or replace function public.assert_interest_eligibility() returns trigger language plpgsql security definer set search_path = public as $$
declare src public.dogs; tgt public.dogs;
begin
  select * into src from public.dogs where id = new.source_dog_id;
  select * into tgt from public.dogs where id = new.target_dog_id;
  if new.status = 'ACTIVE' then
    if src.availability_status <> 'AVAILABLE' or src.profile_status <> 'COMPLETE' or not src.breeding_enabled or src.archived_at is not null
       or tgt.availability_status <> 'AVAILABLE' or tgt.profile_status <> 'COMPLETE' or not tgt.breeding_enabled or tgt.archived_at is not null then
      raise exception 'Both dogs must be eligible for an active interest';
    end if;
    if src.sex = tgt.sex then raise exception 'Interests require complementary sexes'; end if;
    if src.owner_id = tgt.owner_id then raise exception 'Interests between dogs of the same owner are not allowed'; end if;
    -- Sender must be Tier-1 verified (DECISIONS.md #2).
    if (select verification_status from public.owners where id = src.owner_id) <> 'APPROVED' then
      raise exception 'Owner must be verified before expressing interest';
    end if;
  end if;
  return new;
end;
$$;
create trigger interests_assert_eligibility before insert or update of status on public.interests for each row execute function public.assert_interest_eligibility();

-- Reciprocal active interests create exactly one connection atomically (DECISIONS.md #4).
create or replace function public.maybe_create_connection() returns trigger language plpgsql security definer set search_path = public as $$
declare a public.dogs; b public.dogs; lo uuid; hi uuid; existing uuid;
begin
  if new.status <> 'ACTIVE' then return new; end if;
  if exists (select 1 from public.interests r where r.source_dog_id = new.target_dog_id and r.target_dog_id = new.source_dog_id and r.status = 'ACTIVE') then
    select * into a from public.dogs where id = new.source_dog_id;
    select * into b from public.dogs where id = new.target_dog_id;
    if a.id < b.id then lo := a.id; hi := b.id; else lo := b.id; hi := a.id; end if;
    select id into existing from public.connections c where c.lower_dog_id = lo and c.higher_dog_id = hi and c.status = 'ACTIVE';
    if existing is null then
      insert into public.connections (lower_dog_id, higher_dog_id, owner_a_id, owner_b_id)
      values (lo, hi, a.owner_id, b.owner_id);
    end if;
  end if;
  return new;
end;
$$;
create trigger interests_maybe_create_connection after insert or update of status on public.interests for each row execute function public.maybe_create_connection();

alter table public.dog_matching_preferences enable row level security;
alter table public.candidate_passes enable row level security;
alter table public.interests enable row level security;
alter table public.connections enable row level security;

create policy "owners manage their own dog preferences" on public.dog_matching_preferences for all
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

create policy "owners read their own dog passes" on public.candidate_passes for select
  using (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()));
create policy "owners create passes from their own dogs" on public.candidate_passes for insert
  with check (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()));
create policy "owners delete their own dog passes" on public.candidate_passes for delete
  using (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()));

-- Interests are visible to both participating owners; writable only via the source side.
create policy "participants read interests" on public.interests for select
  using (exists (select 1 from public.dogs sd, public.dogs td where sd.id = source_dog_id and td.id = target_dog_id and (sd.owner_id = auth.uid() or td.owner_id = auth.uid())));
create policy "source owners send interests" on public.interests for insert
  with check (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()));
create policy "source owners withdraw interests" on public.interests for update
  using (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = source_dog_id and d.owner_id = auth.uid()));

-- Connections are visible to both owners; creation happens only through the reciprocal-interest trigger.
create policy "participants read connections" on public.connections for select
  using (owner_a_id = auth.uid() or owner_b_id = auth.uid());
