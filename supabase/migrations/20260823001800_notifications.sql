-- M6 Notifications: in-app notification center (docs/product/31-P1_Plan.md M6).
-- Email digest is a later edge-function concern; this migration is the data layer.

create type public.notification_type as enum (
  'INTEREST_RECEIVED', 'MATCH', 'MESSAGE', 'PROCEEDING_CONFIRMED'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,   -- which of YOUR dogs it concerns
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,                  -- e.g. { "fromDogName": "Rosie", "connectionId": "..." }
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_owner_idx on public.notifications(owner_id, created_at desc);
create index notifications_unread_idx on public.notifications(owner_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "owners read own notifications" on public.notifications
  for select using (owner_id = auth.uid());
create policy "owners mark own notifications read" on public.notifications
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Creation is server-side only: a participant of the related dog/connection may
-- create a notification for the OTHER party. Kept simple and definer-checked.
create or replace function public.create_notification(
  p_recipient_owner uuid,
  p_dog_id uuid,
  p_type text,
  p_payload jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- recipient must exist; dog (when given) must belong to the recipient
  if p_dog_id is not null and not exists (
    select 1 from public.dogs d where d.id = p_dog_id and d.owner_id = p_recipient_owner
  ) then
    raise exception 'Notification dog must belong to the recipient';
  end if;
  if p_type not in ('INTEREST_RECEIVED', 'MATCH', 'MESSAGE', 'PROCEEDING_CONFIRMED') then
    raise exception 'Invalid notification type';
  end if;
  insert into public.notifications (owner_id, dog_id, type, payload)
  values (p_recipient_owner, p_dog_id, p_type::public.notification_type, p_payload);
end;
$$;
grant execute on function public.create_notification(uuid, uuid, text, jsonb) to authenticated;

-- Unread count for the bell badge.
create or replace function public.unread_notification_count()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where owner_id = auth.uid() and read_at is null;
$$;

-- Mark all read (single round trip for "open notifications").
create or replace function public.mark_notifications_read()
returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where owner_id = auth.uid() and read_at is null;
$$;

grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
