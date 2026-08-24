-- M10 Expanded screening: lightweight Q&A between match and proceeding.
-- Each owner can attach screening questions to their dog. In a connection,
-- the OTHER party must answer those questions before that dog's owner's
-- proceeding confirmation counts.

create table public.dog_screening_questions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  position int not null default 0,
  question text not null check (char_length(btrim(question)) between 3 and 300),
  created_at timestamptz not null default now()
);
create index screening_questions_dog_idx on public.dog_screening_questions(dog_id, position);
alter table public.dog_screening_questions enable row level security;
create policy "owners manage own dog questions" on public.dog_screening_questions
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- Answers are per connection: connection_id + question_id, answered by the other side.
create table public.screening_answers (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  question_id uuid not null references public.dog_screening_questions(id) on delete cascade,
  answer text not null check (char_length(btrim(answer)) between 1 and 2000),
  answered_by uuid not null references public.owners(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (connection_id, question_id)
);
alter table public.screening_answers enable row level security;
-- Participants read answers in their connections.
create policy "participants read screening answers" on public.screening_answers
  for select using (
    exists (
      select 1 from public.connections c
      where c.id = screening_answers.connection_id and (c.owner_a_id = auth.uid() or c.owner_b_id = auth.uid())
    )
    or exists (
      -- the asker (question's dog owner) also reads
      select 1 from public.dog_screening_questions q
      join public.dogs d on d.id = q.dog_id
      where q.id = screening_answers.question_id and d.owner_id = auth.uid()
    )
  );
create policy "answerers insert own answers" on public.screening_answers
  for insert with check (answered_by = auth.uid());

-- Questions a given participant must answer in this connection.
create or replace function public.pending_screening_questions(p_connection_id uuid)
returns table (id uuid, question text, for_dog_name text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid)
  select q.id, q.question, other_dog.name
  from public.connections c
  join public.dogs my_dog on my_dog.id = case when c.owner_a_id = (select uid from me) then c.lower_dog_id else c.higher_dog_id end
  join public.dogs other_dog on other_dog.id = case when c.owner_a_id = (select uid from me) then c.higher_dog_id else c.lower_dog_id end
  join public.dog_screening_questions q on q.dog_id = other_dog.id
  left join public.screening_answers sa on sa.question_id = q.id and sa.connection_id = c.id
  where c.id = p_connection_id
    and (c.owner_a_id = (select uid from me) or c.owner_b_id = (select uid from me))
    and sa.id is null;
$$;

-- Answer count check: has THIS owner answered everything the other side asked?
create or replace function public.has_answered_all_screening(p_connection_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.pending_screening_questions(p_connection_id));
$$;
grant execute on function public.has_answered_all_screening(uuid) to authenticated;

-- Proceed confirmation now requires outstanding screening answers first.
create or replace function public.guard_proceeding_needs_screening()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pending_screening_questions(new.connection_id)) then
    raise exception 'Answer the other side''s screening questions before confirming proceeding';
  end if;
  return new;
end;
$$;
drop trigger if exists proceed_requires_screening on public.connection_proceed_confirmations;
create trigger proceed_requires_screening before insert on public.connection_proceed_confirmations
for each row execute function public.guard_proceeding_needs_screening();
