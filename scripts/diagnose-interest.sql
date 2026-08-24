-- Diagnose the interest insert failure as postgres. Run each statement and check outputs.

-- 1. Does Dooby exist and in what state?
select id, name, owner_id, availability_status, profile_status, breeding_enabled, archived_at
from public.dogs where name = 'Dooby';

-- 2. Simulate exactly what the client does: insert an interest AS the user's dog.
--    (Run as postgres so RLS doesn't mask the underlying error.)
--    Replace :target_name with the seed dog you clicked Interested on.
insert into public.interests (source_dog_id, target_dog_id, strength)
select d.id, t.id, 'NORMAL'
from public.dogs d, public.dogs t
where d.name = 'Dooby' and t.name = 'Luna';

-- 3. If #2 succeeded, clean it up so you can test from the UI:
delete from public.interests
where source_dog_id = (select id from public.dogs where name = 'Dooby')
  and target_dog_id = (select id from public.dogs where name = 'Luna');
