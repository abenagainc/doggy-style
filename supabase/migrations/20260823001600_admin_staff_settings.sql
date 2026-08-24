-- Admin: staff authorization + platform settings (managed from admin UI).
-- Staff = rows in admin_staff keyed by owner id. First staff member must be
-- inserted manually (SQL Editor) with their auth user id.

create table public.admin_staff (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admin_staff enable row level security;
-- No policies: only security-definer functions touch this table.

create table public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;

-- Seed the cooldown setting (matches migration 01000's 5-minute testing default).
insert into public.platform_settings (key, value) values
  ('reinterest_cooldown_minutes', '5'),
  ('production_mode', 'false')
on conflict (key) do nothing;

-- Is the caller staff?
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_staff where owner_id = auth.uid());
$$;

-- Settings read/write (staff only).
create or replace function public.get_setting(p_key text)
returns text
language sql stable security definer set search_path = public as $$
  select value from public.platform_settings where key = p_key;
$$;

create or replace function public.set_setting(p_key text, p_value text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  insert into public.platform_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.get_setting(text) to authenticated;
grant execute on function public.set_setting(text, text) to authenticated;

-- Reports queue: staff view of all reports with dog/owner context.
create or replace function public.admin_list_reports()
returns table (
  id uuid,
  reason text,
  details text,
  status text,
  reported_owner_id uuid,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reason, r.details, r.status, r.reported_owner_id, r.created_at
  from public.safety_reports r
  where public.is_staff()
  order by r.created_at desc;
$$;

create or replace function public.admin_update_report_status(p_report_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if p_status not in ('OPEN', 'UNDER_REVIEW', 'CLOSED') then raise exception 'Invalid status'; end if;
  update public.safety_reports set status = p_status where id = p_report_id;
end;
$$;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_update_report_status(uuid, text) to authenticated;

-- Cooldown application: the interest cooldown reads this setting at decline time.
create or replace function public.current_cooldown_minutes()
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(value, '')::int, 5) from public.platform_settings where key = 'reinterest_cooldown_minutes';
$$;
