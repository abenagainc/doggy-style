-- Run in SQL Editor: current state of connections + conversations
select c.id,
       (select email from auth.users a where a.id = c.owner_a_id) as owner_a_email,
       (select email from auth.users a where a.id = c.owner_b_id) as owner_b_email,
       c.status, c.created_at
from public.connections c
order by c.created_at desc;

select count(*) as conversation_rows from public.conversations;
