-- Likes leave received/sent when they become a connection: status -> MATCHED.
-- Lists filter on ACTIVE so matched likes disappear from both sides automatically.

alter type public.interest_status add value if not exists 'MATCHED';

-- When a connection is created between two dogs, mark their like rows MATCHED.
create or replace function public.mark_likes_matched() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.interests
  set status = 'MATCHED'
  where status = 'ACTIVE'
    and ((source_dog_id = new.lower_dog_id and target_dog_id = new.higher_dog_id)
      or (source_dog_id = new.higher_dog_id and target_dog_id = new.lower_dog_id));
  return new;
end;
$$;

drop trigger if exists connections_mark_likes_matched on public.connections;
create trigger connections_mark_likes_matched after insert on public.connections
for each row execute function public.mark_likes_matched();

-- Safety net: also mark MATCHED if an ACTIVE interest exists when proceeding confirmations
-- or any later flow checks (covers legacy rows created before this trigger existed).
update public.interests i
set status = 'MATCHED'
where i.status = 'ACTIVE'
  and exists (
    select 1 from public.connections c
    where c.status in ('ACTIVE', 'SCREENING', 'PROCEEDING')
      and ((c.lower_dog_id = i.source_dog_id and c.higher_dog_id = i.target_dog_id)
        or (c.lower_dog_id = i.target_dog_id and c.higher_dog_id = i.source_dog_id))
  );
