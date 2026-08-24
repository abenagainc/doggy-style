-- M6 part 2: server-side notification creation via triggers. This guarantees
-- notifications fire even if the client fails, and keeps clients thin.

-- Interest received: notify the target dog's owner.
create or replace function public.notify_interest_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_owner uuid; source_name text;
begin
  select owner_id into target_owner from public.dogs where id = new.target_dog_id;
  select name into source_name from public.dogs where id = new.source_dog_id;
  insert into public.notifications (owner_id, dog_id, type, payload)
  values (target_owner, new.target_dog_id, 'INTEREST_RECEIVED',
    jsonb_build_object('fromDogId', new.source_dog_id, 'fromDogName', source_name,
                       'strength', new.strength));
  return new;
end;
$$;
drop trigger if exists interests_notify on public.interests;
create trigger interests_notify after insert on public.interests
for each row execute function public.notify_interest_received();

-- Match: when a connection is created (reciprocal interest), notify BOTH owners.
create or replace function public.notify_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare lo_owner uuid; hi_owner uuid; lo_name text; hi_name text;
begin
  select owner_id, name into lo_owner, lo_name from public.dogs where id = new.lower_dog_id;
  select owner_id, name into hi_owner, hi_name from public.dogs where id = new.higher_dog_id;
  insert into public.notifications (owner_id, dog_id, type, payload) values
    (lo_owner, new.lower_dog_id, 'MATCH', jsonb_build_object('otherDogId', new.higher_dog_id, 'otherDogName', hi_name, 'connectionId', new.id)),
    (hi_owner, new.higher_dog_id, 'MATCH', jsonb_build_object('otherDogId', new.lower_dog_id, 'otherDogName', lo_name, 'connectionId', new.id));
  return new;
end;
$$;
drop trigger if exists connections_notify_match on public.connections;
create trigger connections_notify_match after insert on public.connections
for each row execute function public.notify_match();

-- Message received: notify the other conversation participant.
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare conn record; sender_is_a boolean; recipient uuid; recipient_dog uuid;
begin
  select c.*, co.owner_a_id as a_id, co.owner_b_id as b_id
    into conn
  from public.conversations c
  join public.connections co on co.id = c.connection_id
  where c.id = new.conversation_id;
  if conn is null then return new; end if;

  -- recipient = the participant who is NOT the sender
  if conn.a_id = new.sender_owner_id then recipient := conn.b_id; else recipient := conn.a_id; end if;

  -- recipient's dog in this connection (for dog-scoped notifications)
  select case when conn.owner_a_id = recipient then conn.lower_dog_id else conn.higher_dog_id end
    into recipient_dog
    from public.connections conn2 where conn2.id = conn.connection_id;

  insert into public.notifications (owner_id, dog_id, type, payload)
  values (recipient, recipient_dog, 'MESSAGE',
    jsonb_build_object('conversationId', new.conversation_id, 'connectionId', conn.connection_id,
                       'preview', left(new.body, 80)));
  return new;
end;
$$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
for each row execute function public.notify_message();

-- Proceeding confirmed: notify the other owner.
create or replace function public.notify_proceeding() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid; my_dog uuid; their_dog uuid;
begin
  if new.owner_id = (select owner_a_id from public.connections where id = new.connection_id) then
    other := (select owner_b_id from public.connections where id = new.connection_id);
  else
    other := (select owner_a_id from public.connections where id = new.connection_id);
  end if;
  -- Only notify when this confirmation completes the proceeding.
  if (select status from public.connections where id = new.connection_id) = 'PROCEEDING' then
    select case when owner_a_id = other then lower_dog_id else higher_dog_id end into my_dog
      from public.connections where id = new.connection_id;
    insert into public.notifications (owner_id, dog_id, type, payload)
    values (other, my_dog, 'PROCEEDING_CONFIRMED',
      jsonb_build_object('connectionId', new.connection_id));
  end if;
  return new;
end;
$$;
drop trigger if exists proceeding_notify on public.connection_proceed_confirmations;
create trigger proceeding_notify after insert on public.connection_proceed_confirmations
for each row execute function public.notify_proceeding();
