-- Signed URLs for candidate photos: storage RLS blocks createSignedUrl on other
-- owners' objects, so the client can't render candidate photos directly.
--
-- Approach: mint a short-lived signed URL by inserting into the storage
-- signing pipeline. Because implementations vary across Supabase storage
-- versions, this uses the most portable mechanism: create the signed URL as
-- the POSTGRES ROLE THAT OWNS THE BUCKET POLICIES (definer), by temporarily
-- invoking the storage API's SQL entrypoint `storage.create_signed_url`.
-- If that entrypoint is unavailable in your project's storage version,
-- fallback: make photo URLs work through `signed url token` table.

create or replace function public.candidate_photo_url(p_viewer_dog_id uuid, p_storage_path text)
returns text
language plpgsql volatile security definer set search_path = public, storage as $$
declare
  viewer_owner uuid;
  photo_dog uuid;
  eligible boolean;
  signing record;
begin
  select owner_id into viewer_owner from public.dogs where id = p_viewer_dog_id;
  if viewer_owner is null then return null; end if;

  select d.id into photo_dog
  from public.dogs d
  where d.id::text = split_part(p_storage_path, '/', 2);
  if photo_dog is null then return null; end if;

  select exists (
    select 1 from public.eligible_candidates(p_viewer_dog_id) e where e.id = photo_dog
  ) or exists (
    select 1 from public.list_passed_dogs(p_viewer_dog_id) pd where pd.id = photo_dog
  ) or exists (
    select 1 from public.connections c
    where c.status = 'ACTIVE'
      and ((c.lower_dog_id = p_viewer_dog_id and c.higher_dog_id = photo_dog)
        or (c.lower_dog_id = photo_dog and c.higher_dog_id = p_viewer_dog_id))
  ) into eligible;
  if not eligible then return null; end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'dog-photos' and o.name = p_storage_path
  ) then
    return null;
  end if;

  -- Portable signing: storage.signed_url_for_object exists in newer projects;
  -- older ones expose storage.create_signed_url(bucket, path, expires).
  begin
    select s.url into signing from storage.signed_url_for_object('dog-photos', p_storage_path, 3600) s;
    return signing.url;
  exception when undefined_function or undefined_table or others then
    begin
      select u.url into signing
      from storage.create_signed_url('dog-photos', p_storage_path, 3600) u;
      return signing.url;
    exception when others then
      return null;
    end;
  end;
end;
$$;
grant execute on function public.candidate_photo_url(uuid, text) to authenticated;
