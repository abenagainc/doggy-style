-- Milestone 1: account, dog, consent and active-context foundation.
-- Authorization is enforced in PostgreSQL/RLS; application services additionally own lifecycle rules.
create extension if not exists pgcrypto;

create type public.verification_status as enum ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'NEEDS_UPDATE');
create type public.dog_sex as enum ('MALE', 'FEMALE');
create type public.dog_availability_status as enum ('AVAILABLE', 'UNAVAILABLE');
create type public.dog_profile_status as enum ('INCOMPLETE', 'COMPLETE');
create type public.consent_document_type as enum ('TERMS', 'PRIVACY_NOTICE', 'MARKETING', 'LOCATION_PRECISION', 'SENSITIVE_PROFILE_SUMMARIES');

create table public.owners (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  verification_status public.verification_status not null default 'NOT_STARTED',
  active_dog_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_consents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  document_type public.consent_document_type not null,
  document_version text not null check (char_length(trim(document_version)) > 0),
  locale text not null check (char_length(trim(locale)) > 0),
  integrity_hash text not null check (char_length(trim(integrity_hash)) > 0),
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (owner_id, document_type, document_version)
);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  sex public.dog_sex not null,
  date_of_birth date not null check (date_of_birth <= current_date),
  breed text not null check (char_length(trim(breed)) between 1 and 100),
  location text,
  breeding_enabled boolean not null default false,
  profile_status public.dog_profile_status not null default 'INCOMPLETE',
  availability_status public.dog_availability_status not null default 'UNAVAILABLE',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint available_dog_must_be_complete check (availability_status <> 'AVAILABLE' or profile_status = 'COMPLETE'),
  constraint archived_dog_must_be_unavailable check (archived_at is null or availability_status = 'UNAVAILABLE')
);

alter table public.owners add constraint owners_active_dog_fk foreign key (active_dog_id) references public.dogs(id) on delete set null;

create table public.dog_photos (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/.+$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index dogs_owner_active_idx on public.dogs(owner_id) where archived_at is null;
create index dogs_discovery_eligibility_idx on public.dogs(availability_status, profile_status) where archived_at is null;
create index dog_photos_dog_idx on public.dog_photos(dog_id, sort_order);
create index owner_consents_owner_idx on public.owner_consents(owner_id, accepted_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger owners_set_updated_at before update on public.owners for each row execute function public.set_updated_at();
create trigger dogs_set_updated_at before update on public.dogs for each row execute function public.set_updated_at();

create or replace function public.protect_owner_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- An owner controls account display settings and active context, never their own trust state.
  if auth.uid() = old.id and new.verification_status is distinct from old.verification_status then raise exception 'Verification status may only be changed by an authorized reviewer'; end if;
  return new;
end;
$$;
create trigger owners_protect_settings before update on public.owners for each row execute function public.protect_owner_settings();

-- Called by Supabase Auth. Verification workflow itself is intentionally deferred in P0.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare consent jsonb;
begin
  consent := new.raw_user_meta_data -> 'signupConsent';
  if consent is null or coalesce(consent ->> 'termsVersion', '') = '' or coalesce(consent ->> 'privacyNoticeVersion', '') = '' or coalesce(consent ->> 'locale', '') = '' or coalesce(consent ->> 'termsHash', '') = '' or coalesce(consent ->> 'privacyNoticeHash', '') = '' then
    raise exception 'Versioned Terms and Privacy Notice consent is required';
  end if;
  insert into public.owners (id, display_name) values (new.id, nullif(new.raw_user_meta_data ->> 'displayName', '')) on conflict (id) do nothing;
  insert into public.owner_consents (owner_id, document_type, document_version, locale, integrity_hash)
  values
    (new.id, 'TERMS', consent ->> 'termsVersion', consent ->> 'locale', consent ->> 'termsHash'),
    (new.id, 'PRIVACY_NOTICE', consent ->> 'privacyNoticeVersion', consent ->> 'locale', consent ->> 'privacyNoticeHash');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Profile completion is authoritative and cannot be forged by a browser update.
create or replace function public.dog_is_complete(p_dog_id uuid, p_location text, p_breeding_enabled boolean) returns boolean language sql stable security definer set search_path = public as $$
  select p_location is not null and btrim(p_location) <> '' and p_breeding_enabled and exists (select 1 from public.dog_photos p where p.dog_id = p_dog_id);
$$;
create or replace function public.refresh_dog_profile_status(p_dog_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.dogs d set profile_status = case when public.dog_is_complete(d.id, d.location, d.breeding_enabled) then 'COMPLETE'::public.dog_profile_status else 'INCOMPLETE'::public.dog_profile_status end,
  availability_status = case when not public.dog_is_complete(d.id, d.location, d.breeding_enabled) then 'UNAVAILABLE'::public.dog_availability_status else d.availability_status end
  where d.id = p_dog_id;
end;
$$;
create or replace function public.refresh_profile_on_photo_change() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.refresh_dog_profile_status(coalesce(new.dog_id, old.dog_id)); return coalesce(new, old); end;
$$;
create trigger dog_photos_refresh_profile after insert or delete on public.dog_photos for each row execute function public.refresh_profile_on_photo_change();
create or replace function public.refresh_profile_on_dog_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.location is distinct from old.location or new.breeding_enabled is distinct from old.breeding_enabled then perform public.refresh_dog_profile_status(new.id); end if;
  return new;
end;
$$;
create trigger dogs_refresh_profile after update of location, breeding_enabled on public.dogs for each row execute function public.refresh_profile_on_dog_change();

create or replace function public.protect_dog_lifecycle() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.archived_at is not null and new.archived_at is null then raise exception 'Archived dogs cannot be restored'; end if;
  new.profile_status := case when public.dog_is_complete(new.id, new.location, new.breeding_enabled) then 'COMPLETE'::public.dog_profile_status else 'INCOMPLETE'::public.dog_profile_status end;
  if new.profile_status = 'INCOMPLETE' and new.availability_status = 'AVAILABLE' and old.availability_status = 'UNAVAILABLE' then raise exception 'Complete profile before availability'; end if;
  if new.profile_status = 'INCOMPLETE' then new.availability_status := 'UNAVAILABLE'; end if;
  if new.archived_at is not null then new.availability_status := 'UNAVAILABLE'; end if;
  return new;
end;
$$;
create trigger dogs_protect_lifecycle before update on public.dogs for each row execute function public.protect_dog_lifecycle();

create or replace function public.clear_archived_active_dog() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then update public.owners set active_dog_id = null where id = new.owner_id and active_dog_id = new.id; end if;
  return new;
end;
$$;
create trigger dogs_clear_archived_active_dog after update of archived_at on public.dogs for each row execute function public.clear_archived_active_dog();

create or replace function public.validate_active_dog_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_dog_id is not null and not exists (select 1 from public.dogs d where d.id = new.active_dog_id and d.owner_id = new.id and d.archived_at is null) then raise exception 'Active dog must be an active dog owned by the owner'; end if;
  return new;
end;
$$;
create trigger owners_validate_active_dog before insert or update of active_dog_id on public.owners for each row execute function public.validate_active_dog_owner();

create or replace function public.validate_dog_photo_path() returns trigger language plpgsql security definer set search_path = public as $$
declare dog_owner_id uuid;
begin
  select owner_id into dog_owner_id from public.dogs where id = new.dog_id;
  if new.storage_path !~ ('^' || dog_owner_id::text || '/' || new.dog_id::text || '/.+$') then raise exception 'Photo path must belong to the photo dog and owner'; end if;
  return new;
end;
$$;
create trigger dog_photos_validate_path before insert or update of storage_path, dog_id on public.dog_photos for each row execute function public.validate_dog_photo_path();

alter table public.owners enable row level security;
alter table public.owner_consents enable row level security;
alter table public.dogs enable row level security;
alter table public.dog_photos enable row level security;

create policy "owners read their account" on public.owners for select using (id = auth.uid());
create policy "owners update their account" on public.owners for update using (id = auth.uid()) with check (id = auth.uid());
create policy "owners read their consent history" on public.owner_consents for select using (owner_id = auth.uid());
-- Required signup consent is written only by the Auth trigger. Optional granular consent is added by a future scoped flow.
create policy "owners read own dogs" on public.dogs for select using (owner_id = auth.uid());
create policy "owners create own dogs" on public.dogs for insert with check (owner_id = auth.uid() and archived_at is null and availability_status = 'UNAVAILABLE' and profile_status = 'INCOMPLETE');
create policy "owners update own dogs" on public.dogs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read own dog photos" on public.dog_photos for select using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
create policy "owners insert own dog photos" on public.dog_photos for insert with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid() and d.archived_at is null));
create policy "owners delete own dog photos" on public.dog_photos for delete using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('dog-photos', 'dog-photos', false) on conflict (id) do nothing;
-- Storage RLS note: the storage service cannot evaluate cross-table subqueries inside policies,
-- so the dogs-existence check lives in a SECURITY DEFINER function instead.
create or replace function public.can_upload_to_dog(p_uid uuid, p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_path))[1] = p_uid::text
    and exists (
      select 1 from public.dogs d
      where d.id::text = (storage.foldername(p_path))[2]
        and d.owner_id = p_uid
        and d.archived_at is null
    );
$$;
create policy "owners upload only into own dog folder" on storage.objects for insert to authenticated with check (bucket_id = 'dog-photos' and public.can_upload_to_dog(auth.uid(), name));
create policy "owners read own dog storage" on storage.objects for select to authenticated using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete own dog storage" on storage.objects for delete to authenticated using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
