-- Milestone 3: conversations, messages, proceeding confirmations.
-- Conversations are created with connections; closed connections become read-only (docs/technical/22 §§3-4).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_owner_id uuid not null references public.owners(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  sent_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, sent_at);

-- Per-owner proceeding confirmations (DECISIONS.md #5): one row per (connection, owner), idempotent.
create table public.connection_proceed_confirmations (
  connection_id uuid not null references public.connections(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (connection_id, owner_id)
);

-- Transition a connection to PROCEEDING once both participating owners have confirmed.
create or replace function public.refresh_proceeding_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare conn record; owner_a uuid; owner_b uuid;
begin
  select * into conn from public.connections c where c.id = new.connection_id;
  if conn.status = 'CLOSED' then raise exception 'A closed connection cannot proceed'; end if;
  select d.owner_id into owner_a from public.dogs d where d.id = conn.lower_dog_id;
  select d.owner_id into owner_b from public.dogs d where d.id = conn.higher_dog_id;
  if exists (select 1 from public.connection_proceed_confirmations x where x.connection_id = conn.id and x.owner_id in (owner_a, owner_b))
     and (select count(*) from public.connection_proceed_confirmations x where x.connection_id = conn.id and x.owner_id in (owner_a, owner_b)) >= 2 then
    update public.connections set status = 'PROCEEDING' where id = conn.id and status <> 'PROCEEDING';
  end if;
  return new;
end;
$$;
create trigger proceed_confirmations_refresh after insert on public.connection_proceed_confirmations
for each row execute function public.refresh_proceeding_status();

-- Guard: messages may only be sent while the connection permits messaging (defense in depth).
create or replace function public.assert_message_allowed() returns trigger
language plpgsql security definer set search_path = public as $$
declare status text;
begin
  select c.status into status from public.connections c join public.conversations v on v.connection_id = c.id where v.id = new.conversation_id;
  if status is null then raise exception 'Conversation does not exist'; end if;
  if status = 'CLOSED' then raise exception 'This conversation is read-only'; end if;
  return new;
end;
$$;
create trigger messages_assert_allowed before insert on public.messages for each row execute function public.assert_message_allowed();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.connection_proceed_confirmations enable row level security;

-- Participants of the underlying connection may read their conversation.
create policy "participants read conversations" on public.conversations for select
  using (exists (select 1 from public.connections c where c.id = connection_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())));

-- Participants may read all messages in their conversation...
create policy "participants read messages" on public.messages for select
  using (exists (
    select 1
    from public.conversations v
    join public.connections c on c.id = v.connection_id
    where v.id = conversation_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
  ));
-- ...and send only as themselves into an open conversation.
create policy "participants send messages" on public.messages for insert
  with check (
    sender_owner_id = auth.uid() and exists (
      select 1
      from public.conversations v
      join public.connections c on c.id = v.connection_id
      where v.id = conversation_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
    )
  );

-- Confirmations visible to participants; inserts restricted to self.
create policy "participants read confirmations" on public.connection_proceed_confirmations for select
  using (owner_id = auth.uid() or exists (
    select 1 from public.connections c where c.id = connection_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
  ));
create policy "owners confirm own proceeding" on public.connection_proceed_confirmations for insert
  with check (owner_id = auth.uid());
