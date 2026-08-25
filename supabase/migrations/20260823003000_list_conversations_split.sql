-- Messages tab: two sub-tabs.
-- "connections" = connected, chat not yet initiated (no messages exchanged).
-- "messages"    = connected with at least one message; shows last message preview.

-- Return type changed since 02900 — must drop before redefining.
drop function if exists public.list_my_conversations();

create or replace function public.list_my_conversations()
returns table (
  connection_id uuid,
  status text,
  my_dog_id uuid,
  other_dog_id uuid,
  other_dog_name text,
  other_dog_cover text,
  has_messages boolean,
  last_message text,
  last_message_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select distinct on (c.id)
    c.id,
    c.status::text,
    case when da.owner_id = auth.uid() then c.lower_dog_id else c.higher_dog_id end as my_dog_id,
    case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end as other_dog_id,
    case when da.owner_id = auth.uid() then db.name else da.name end as other_dog_name,
    public.dog_cover_photo(case when da.owner_id = auth.uid() then c.higher_dog_id else c.lower_dog_id end) as other_dog_cover,
    exists (select 1 from public.messages m where m.conversation_id = cv.id) as has_messages,
    (select m.body from public.messages m where m.conversation_id = cv.id order by m.sent_at desc limit 1) as last_message,
    (select m.sent_at from public.messages m where m.conversation_id = cv.id order by m.sent_at desc limit 1) as last_message_at
  from public.connections c
  join public.dogs da on da.id = c.lower_dog_id
  join public.dogs db on db.id = c.higher_dog_id
  left join public.conversations cv on cv.connection_id = c.id and not (
    (cv.deleted_by_a = true and da.owner_id = auth.uid()) or (cv.deleted_by_b = true and db.owner_id = auth.uid())
  )
  where (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
    and c.status <> 'CLOSED'
  order by c.id, coalesce(
    (select m.sent_at from public.messages m where m.conversation_id = cv.id order by m.sent_at desc limit 1),
    c.created_at
  ) desc;
$$;
