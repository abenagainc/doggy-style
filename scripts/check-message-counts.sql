-- Run in SQL Editor (as postgres, sees everything):
-- How many messages exist per conversation?
select cv.id as conversation_id,
       (select count(*) from public.messages m where m.conversation_id = cv.id) as message_count
from public.conversations cv;
