-- Milestone 4: safety (blocks, reports + minimal moderation queue) and analytics events.
-- DECISIONS.md #6 (blocking consequences), #9 (minimal moderation queue); docs/technical/25 §§4-5, 27, 28.

create table public.blocks (
  blocker_id uuid not null references public.owners(id) on delete cascade,
  blocked_id uuid not null references public.owners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);

create type public.report_reason as enum ('INAPPROPRIATE_CONTENT', 'HARASSMENT', 'MISREPRESENTATION', 'SAFETY_CONCERN', 'OTHER');
create type public.report_status as enum ('OPEN', 'IN_REVIEW', 'CLOSED');

-- Reports double as moderation cases: immutable case id, status lifecycle, reviewer audit trail (DECISIONS.md #9).
create table public.reports (
  case_id uuid primary key default gen_random_uuid(),
  reporter_owner_id uuid not null references public.owners(id) on delete cascade,
  target_owner_id uuid not null references public.owners(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or char_length(btrim(details)) between 1 and 2000),
  status public.report_status not null default 'OPEN',
  reviewer_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.owners(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint no_self_report check (reporter_owner_id <> target_owner_id)
);
create index reports_status_idx on public.reports(status, created_at desc);
create index reports_target_idx on public.reports(target_owner_id);

-- Minimal review actions: triage to IN_REVIEW and close. Full admin tooling is P1 (docs/product/16).
create or replace function public.assert_review_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if old.reviewed_at is not null then raise exception 'Closed cases are immutable'; end if;
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create trigger reports_review_guard before update on public.reports for each row execute function public.assert_review_transition();

-- Analytics events (docs/technical/28): non-sensitive product events only.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (char_length(event_name) between 1 and 80),
  owner_id uuid references public.owners(id) on delete set null,
  dog_id uuid references public.dogs(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events(event_name, occurred_at desc);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.analytics_events enable row level security;

-- Blocks: visible to their creator only; enforced server-side below regardless of visibility.
create policy "owners read own blocks" on public.blocks for select using (blocker_id = auth.uid());
create policy "owners create own blocks" on public.blocks for insert with check (blocker_id = auth.uid());

-- Reports: reporter sees own submissions; content never editable after submission except review fields via service role.
create policy "reporters read own reports" on public.reports for select using (reporter_owner_id = auth.uid());
create policy "owners submit reports" on public.reports for insert with check (reporter_owner_id = auth.uid());

-- Analytics: owners may append events about themselves; no one reads raw events from the client.
create policy "owners insert own events" on public.analytics_events for insert with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Block enforcement at the database level (DECISIONS.md #6; docs/technical/22 §7):
-- a blocked pair cannot create new interests; existing connections are closed by the domain
-- service when the block lands, and this trigger keeps the invariant if data changes later.
-- ---------------------------------------------------------------------------

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
create trigger interests_assert_no_block before insert on public.interests for each row execute function public.assert_no_block_between();

create or replace function public.close_connections_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare a_dogs uuid[]; b_dogs uuid[];
begin
  select array_agg(id) into a_dogs from public.dogs where owner_id = new.blocker_id;
  select array_agg(id) into b_dogs from public.dogs where owner_id = new.blocked_id;
  update public.connections c set status = 'CLOSED'
  where c.status in ('ACTIVE','SCREENING','PROCEEDING')
    and ((c.lower_dog_id = any(a_dogs) and c.higher_dog_id = any(b_dogs))
      or (c.lower_dog_id = any(b_dogs) and c.higher_dog_id = any(a_dogs)));
  return new;
end;
$$;
create trigger blocks_close_connections after insert on public.blocks
for each row execute function public.close_connections_on_block();
