-- Check the LIVE function definition on the database
select prosrc from pg_proc
where proname = 'list_my_conversations' and pronamespace = 'public'::regnamespace;
