-- Reconsider-all: clears every pass for a source dog so passed candidates
-- flow back into discovery. Owner-scoped via security definer.

create or replace function public.reconsider_all_passed(p_source_dog_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare cleared int;
begin
  -- Authorization: caller must own the source dog.
  if not exists (
    select 1 from public.dogs d where d.id = p_source_dog_id and d.owner_id = auth.uid()
  ) then
    raise exception 'Not your dog';
  end if;

  delete from public.candidate_passes where source_dog_id = p_source_dog_id;
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;
grant execute on function public.reconsider_all_passed(uuid) to authenticated;
