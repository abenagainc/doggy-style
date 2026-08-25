-- Diagnose why list_my_conversations returns 0 while list_my_connections returns 1.
-- Run each statement and inspect.

-- 1. The connection row itself
select id, lower_dog_id, higher_dog_id, owner_a_id, owner_b_id, status
from public.connections;

-- 2. Does the caller (seed) match owner_a or owner_b?
select c.id,
       (select email from auth.users a where a.id = c.owner_a_id) as a_email,
       (select email from auth.users a where a.id = c.owner_b_id) as b_email
from public.connections c;

-- 3. Conversation rows for this connection?
select * from public.conversations;

-- 4. Full RPC simulation with joins visible
select c.id, cv.id as conv_id, cv.deleted_by_a, cv.deleted_by_b
from public.connections c
join public.dogs da on da.id = c.lower_dog_id
join public.dogs db on db.id = c.higher_dog_id
left join public.conversations cv on cv.connection_id = c.id;
