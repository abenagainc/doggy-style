-- Run in Supabase SQL Editor: create a test notification for the USER account,
-- addressed to a real inbox (bypasses RLS since it runs as postgres).
insert into public.notifications (owner_id, dog_id, type, payload)
select d.owner_id, d.id, 'INTEREST_RECEIVED',
       jsonb_build_object('fromDogName', 'Rosie (digest test)', 'strength', 'NORMAL')
from public.dogs d
where d.name = 'Noshka'
limit 1;

-- Show the recipient's real email for confirmation
select a.email, n.type
from public.notifications n
join auth.users a on a.id = n.owner_id
where n.read_at is null;
