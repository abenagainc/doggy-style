-- Fix admin_delete_owner to only check for non-archived dogs (matching UI behavior)
-- Previously checked all dogs including archived, causing false rejections
-- when a user had only archived dogs.

create or replace function public.admin_delete_owner(p_owner_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  dog_count int;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select count(*) into dog_count from public.dogs
    where owner_id = p_owner_id and archived_at is null;
  if dog_count > 0 then
    raise exception 'Owner has % dog(s) — archive or delete them first', dog_count;
  end if;
  delete from public.admin_staff where owner_id = p_owner_id;
  delete from public.owners where id = p_owner_id;
end;
$$;

grant execute on function public.admin_delete_owner(uuid) to authenticated;
