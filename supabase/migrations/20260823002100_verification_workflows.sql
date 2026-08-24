-- M9 Verification workflows: owner submits identity documents, admin reviews.
-- docs/technical/26: tiered trust; this implements Tier-2 (identity doc review).

create table public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  storage_path text not null,                    -- private bucket path
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_note text check (reviewer_note is null or char_length(btrim(reviewer_note)) between 1 and 500),
  reviewed_by uuid references public.owners(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_submissions_owner_idx on public.verification_submissions(owner_id, created_at desc);
create index verification_submissions_status_idx on public.verification_submissions(status, created_at desc);

alter table public.verification_submissions enable row level security;

create policy "owners read own submissions" on public.verification_submissions
  for select using (owner_id = auth.uid());

-- Private bucket for identity documents (created via dashboard or here through storage API).
-- RLS: only the owner can read their own documents.
insert into storage.buckets (id, name, public) values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

drop policy if exists "own verification docs read" on storage.objects;
create policy "own verification docs read" on storage.objects for select
  using (bucket_id = 'verification-docs' and owner_id = auth.uid());
drop policy if exists "own verification docs insert" on storage.objects;
create policy "own verification docs insert" on storage.objects for insert
  with check (bucket_id = 'verification-docs' and owner_id = auth.uid());
drop policy if exists "staff verification docs read" on storage.objects;
create policy "staff verification docs read" on storage.objects for select
  using (bucket_id = 'verification-docs' and public.is_staff());

-- Submit: records a PENDING submission and flips owner to PENDING.
create or replace function public.submit_verification(p_storage_path text, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare sub_id uuid; my_owner uuid;
begin
  my_owner := auth.uid();
  if my_owner is null then raise exception 'Sign in required'; end if;

  -- The uploaded path must be in this owner's own folder.
  if split_part(p_storage_path, '/', 1) <> my_owner::text then
    raise exception 'Document path must be in your own folder';
  end if;
  if exists (select 1 from public.verification_submissions
             where owner_id = my_owner and status = 'PENDING') then
    raise exception 'You already have a pending submission';
  end if;

  insert into public.verification_submissions (owner_id, storage_path, note)
  values (my_owner, p_storage_path, p_note)
  returning id into sub_id;

  update public.owners set verification_status = 'PENDING' where id = my_owner;
  return sub_id;
end;
$$;

-- Admin: list pending submissions with owner context.
create or replace function public.admin_list_verification_submissions()
returns table (
  id uuid,
  owner_id uuid,
  display_name text,
  storage_path text,
  note text,
  submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, o.display_name, v.storage_path, v.note, v.created_at
  from public.verification_submissions v
  join public.owners o on o.id = v.owner_id
  where v.status = 'PENDING' and public.is_staff()
  order by v.created_at asc;
$$;

-- Admin: decide a submission. APPROVED flips owner verification; REJECTED keeps NOT_STARTED-ish state via REJECTED.
create or replace function public.admin_decide_verification(p_submission_id uuid, p_decision text, p_reviewer_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare sub record;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if p_decision not in ('APPROVED', 'REJECTED') then raise exception 'Invalid decision'; end if;

  select * into sub from public.verification_submissions where id = p_submission_id;
  if sub is null then raise exception 'Submission not found'; end if;
  if sub.status <> 'PENDING' then raise exception 'Already decided'; end if;

  update public.verification_submissions
  set status = p_decision, reviewer_note = p_reviewer_note,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_submission_id;

  update public.owners set verification_status = p_decision::public.verification_status where id = sub.owner_id;
end;
$$;

grant execute on function public.submit_verification(text, text) to authenticated;
grant execute on function public.admin_list_verification_submissions() to authenticated;
grant execute on function public.admin_decide_verification(uuid, text, text) to authenticated;
