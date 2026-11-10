-- Called It: nightly slates of yes/no questions (UNJ-1421).
--
-- The generate-slate Edge Function writes draft slates with the service role.
-- Admins review them in the app (edit wording, drop questions) and publish.
-- Players only ever see published slates.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.admins is
  'Called It staff who can review and publish slates. Add rows by hand in the dashboard.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create table public.slates (
  id uuid primary key default gen_random_uuid(),
  -- US Eastern calendar date of the games.
  slate_date date not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  generated_at timestamptz not null default now(),
  -- Plain-language notes from the generator, such as "only 4 questions found".
  generator_notes jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates (id) on delete cascade,
  position int not null check (position > 0),
  sport text not null check (sport in ('nba', 'nfl')),
  -- Unjuiced game id (NBA numeric id or nflverse id such as 2026_10_WAS_NYG).
  game_id text not null,
  game_label text not null,
  starts_at timestamptz not null,
  -- Picks close at this time. Starts as the game start time.
  lock_at timestamptz not null,
  -- What players read. Admins may reword it; the grading rule never changes.
  prompt text not null check (char_length(prompt) between 10 and 200),
  generated_prompt text not null,
  -- How UNJ-1423 grades the question. See GradingRule in supabase/functions/_shared/slate/types.ts.
  grading_rule jsonb not null,
  -- False when an admin drops the question from the slate.
  included boolean not null default true,
  -- Line, no-vig chance and book count when the question was generated.
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slate_id, position)
);
create index questions_slate_id_idx on public.questions (slate_id);
create index questions_lock_at_idx on public.questions (lock_at);

-- The hit-rate hint under each question. Kept in its own table so the
-- Pro-only rule can be enforced by the database (UNJ-1426 adds the Pro policy).
create table public.question_stat_lines (
  question_id uuid primary key references public.questions (id) on delete cascade,
  stat_line text not null
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_touch_updated_at
before update on public.questions
for each row execute function public.touch_updated_at();

-- Row level security ---------------------------------------------------------

alter table public.admins enable row level security;
alter table public.slates enable row level security;
alter table public.questions enable row level security;
alter table public.question_stat_lines enable row level security;

create policy "Admins can see their own admin row"
on public.admins for select to authenticated
using (user_id = (select auth.uid()));

create policy "Published slates are visible; admins see drafts"
on public.slates for select to authenticated
using (status = 'published' or (select public.is_admin()));

create policy "Questions on published slates are visible; admins see all"
on public.questions for select to authenticated
using (
  (select public.is_admin())
  or (
    included
    and exists (
      select 1 from public.slates s
      where s.id = questions.slate_id and s.status = 'published'
    )
  )
);

create policy "Admins can edit questions on draft slates"
on public.questions for update to authenticated
using (
  (select public.is_admin())
  and exists (select 1 from public.slates s where s.id = questions.slate_id and s.status = 'draft')
)
with check (
  (select public.is_admin())
  and exists (select 1 from public.slates s where s.id = questions.slate_id and s.status = 'draft')
);

create policy "Admins can see stat lines"
on public.question_stat_lines for select to authenticated
using ((select public.is_admin()));

-- Admins may only change the wording and whether a question is in the slate.
revoke all on public.admins, public.slates, public.questions, public.question_stat_lines
  from anon, authenticated;
grant select on public.admins, public.slates, public.questions, public.question_stat_lines
  to authenticated;
grant update (prompt, included) on public.questions to authenticated;

-- Publishing -----------------------------------------------------------------

create or replace function public.publish_slate(p_slate_id uuid)
returns public.slates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slate public.slates;
  v_count int;
  v_locked int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish slates.' using errcode = '42501';
  end if;

  select * into v_slate from public.slates where id = p_slate_id for update;
  if not found then
    raise exception 'Slate not found.' using errcode = 'P0002';
  end if;
  if v_slate.status <> 'draft' then
    raise exception 'This slate is already published.' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where lock_at <= now())
    into v_count, v_locked
  from public.questions
  where slate_id = p_slate_id and included;

  if v_count < 5 or v_count > 10 then
    raise exception 'A slate needs 5 to 10 questions; this one has %.', v_count using errcode = '22023';
  end if;
  if v_locked > 0 then
    raise exception '% of the questions have already locked. Drop them or regenerate.', v_locked
      using errcode = '22023';
  end if;

  update public.slates
     set status = 'published', published_at = now(), published_by = (select auth.uid())
   where id = p_slate_id
  returning * into v_slate;
  return v_slate;
end;
$$;

revoke all on function public.publish_slate(uuid) from public, anon;
grant execute on function public.publish_slate(uuid) to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Generating -----------------------------------------------------------------

-- Called by the generate-slate Edge Function with the service role. Replaces
-- the draft for that date in one transaction. Refuses once it is published.
create or replace function public.replace_draft_slate(
  p_slate_date date,
  p_notes jsonb,
  p_questions jsonb
)
returns public.slates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slate public.slates;
  v_q jsonb;
  v_question_id uuid;
begin
  insert into public.slates (slate_date)
  values (p_slate_date)
  on conflict (slate_date) do nothing;

  select * into v_slate from public.slates where slate_date = p_slate_date for update;
  if v_slate.status <> 'draft' then
    raise exception 'The slate for % is already published.', p_slate_date using errcode = '22023';
  end if;

  delete from public.questions where slate_id = v_slate.id;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    insert into public.questions (
      slate_id, position, sport, game_id, game_label, starts_at, lock_at,
      prompt, generated_prompt, grading_rule, source
    ) values (
      v_slate.id,
      (v_q ->> 'position')::int,
      v_q ->> 'sport',
      v_q ->> 'game_id',
      v_q ->> 'game_label',
      (v_q ->> 'starts_at')::timestamptz,
      (v_q ->> 'lock_at')::timestamptz,
      v_q ->> 'prompt',
      v_q ->> 'prompt',
      v_q -> 'grading_rule',
      coalesce(v_q -> 'source', '{}'::jsonb)
    )
    returning id into v_question_id;

    insert into public.question_stat_lines (question_id, stat_line)
    values (v_question_id, v_q ->> 'stat_line');
  end loop;

  update public.slates
     set generated_at = now(), generator_notes = coalesce(p_notes, '[]'::jsonb)
   where id = v_slate.id
  returning * into v_slate;
  return v_slate;
end;
$$;

revoke all on function public.replace_draft_slate(date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_draft_slate(date, jsonb, jsonb) to service_role;
