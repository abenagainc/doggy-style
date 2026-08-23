-- Fix: connections UPDATE policy was missing — participants could read connections
-- (SELECT policy) but not update them, so Reject/End silently failed.
-- Also the earlier "update without returning" reported OK but changed nothing:
-- PostgREST applies RLS to the updated rows; without an UPDATE policy, zero rows match.

-- The M2 migration constrained connections.status to 'ACTIVE' only, which blocks
-- the documented lifecycle ACTIVE → PROCEEDING/CLOSED. Widen it to the spec'd states
-- (docs/technical/22 §3) while keeping invalid values out.
alter table public.connections drop constraint if exists connections_status_check;
alter table public.connections add constraint connections_status_check check (status in ('ACTIVE', 'SCREENING', 'PROCEEDING', 'CLOSED'));

create or replace function public.is_connection_participant(p_connection_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections c
    where c.id = p_connection_id and (c.owner_a_id = p_uid or c.owner_b_id = p_uid)
  );
$$;
grant execute on function public.is_connection_participant(uuid, uuid) to authenticated;

drop policy if exists "participants update own connections" on public.connections;
create policy "participants update own connections" on public.connections for update
  using (public.is_connection_participant(id, auth.uid()))
  with check (public.is_connection_participant(id, auth.uid()));
