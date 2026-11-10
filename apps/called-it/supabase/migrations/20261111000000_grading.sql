-- Called It: automatic grading, points and results (UNJ-1423).
--
-- The grade-slates Edge Function runs on a schedule with the service role. It
-- reads final game data from Unjuiced, decides each question (yes, no or void)
-- with the question's stored grading rule, and calls settle_question, which
-- scores every pick on it. When the last question on a slate is settled the
-- slate is marked graded, and the function sends the "results are in" push.
--
-- Players can read results (they are columns on questions and on their own
-- picks) but cannot write any of them.

-- Scoring settings ------------------------------------------------------------

-- One row. Change it in the SQL editor to tune the bonus without a release.
-- Base points per question are questions.points (10 for now, see the picks migration).
create table public.scoring_settings (
  id boolean primary key default true check (id),
  -- A correct pick on an answer chosen by less than `under` of the players who
  -- picked that question earns `bonus` extra points. The biggest matching bonus wins.
  bonus_tiers jsonb not null default '[{"under": 0.25, "bonus": 10}, {"under": 0.5, "bonus": 5}]'::jsonb,
  -- No bonus on a question with fewer picks than this, so two players on a
  -- quiet night cannot make each other "unpopular".
  bonus_min_picks int not null default 10 check (bonus_min_picks >= 1),
  updated_at timestamptz not null default now()
);
insert into public.scoring_settings default values;

comment on table public.scoring_settings is
  'Called It bonus rules for less popular correct picks. One row; edit to tune.';

alter table public.scoring_settings enable row level security;
revoke all on public.scoring_settings from anon, authenticated;

-- Bonus points for a correct pick, given how many players made the same pick
-- (p_same) out of everyone who picked that question (p_total).
create or replace function public.pick_bonus(p_same int, p_total int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select max((tier ->> 'bonus')::int)
    from public.scoring_settings s,
         jsonb_array_elements(s.bonus_tiers) tier
    where p_total >= s.bonus_min_picks
      and p_total > 0
      and p_same::numeric / p_total < (tier ->> 'under')::numeric
  ), 0);
$$;

revoke all on function public.pick_bonus(int, int) from public, anon, authenticated;
grant execute on function public.pick_bonus(int, int) to service_role;

-- Results columns -------------------------------------------------------------

alter table public.questions
  add column result text check (result in ('yes', 'no', 'void')),
  -- The player's summed stat, such as 31 points. Null when void.
  add column result_value numeric,
  -- Why a question was voided, such as "Game postponed" or "Jalen Brunson did not play".
  add column void_reason text,
  add column graded_at timestamptz,
  -- How players picked, counted when the question was settled. Shown as
  -- "Only 18% picked Yes" and used for the bonus.
  add column yes_picks int,
  add column no_picks int;

create index questions_ungraded_idx on public.questions (starts_at) where result is null and included;

alter table public.picks
  -- Null until graded, and stays null when the question is void.
  add column correct boolean,
  add column base_points int,
  add column bonus_points int,
  add column points_earned int generated always as (coalesce(base_points, 0) + coalesce(bonus_points, 0)) stored;

alter table public.slates
  -- Set when every included question on the slate has a result.
  add column graded_at timestamptz,
  -- Set when the "results are in" push has gone out.
  add column results_notified_at timestamptz;

-- Settling a question ---------------------------------------------------------

-- Saves a question's result and scores every pick on it, in one transaction.
-- Returns true when this settles the last open question on the slate.
-- Settling an already settled question does nothing unless p_force is true
-- (to correct a result; scores are recomputed from scratch).
create or replace function public.settle_question(
  p_question_id uuid,
  p_result text,
  p_value numeric default null,
  p_void_reason text default null,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.questions;
  v_yes int;
  v_no int;
  v_answer boolean;
  v_bonus int;
  v_done boolean := false;
begin
  if p_result is null or p_result not in ('yes', 'no', 'void') then
    raise exception 'Result must be yes, no or void.' using errcode = '22023';
  end if;

  select * into v_q from public.questions where id = p_question_id for update;
  if not found then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;
  if v_q.result is not null and not p_force then
    return false;
  end if;
  if now() < v_q.lock_at then
    raise exception 'This question has not locked yet.' using errcode = '22023';
  end if;

  select count(*) filter (where answer), count(*) filter (where not answer)
    into v_yes, v_no
  from public.picks
  where question_id = p_question_id;

  update public.questions
     set result = p_result,
         result_value = case when p_result = 'void' then null else p_value end,
         void_reason = case when p_result = 'void' then coalesce(p_void_reason, 'Voided') end,
         graded_at = now(),
         yes_picks = v_yes,
         no_picks = v_no
   where id = p_question_id;

  if p_result = 'void' then
    update public.picks
       set correct = null, base_points = 0, bonus_points = 0
     where question_id = p_question_id;
  else
    v_answer := p_result = 'yes';
    v_bonus := public.pick_bonus(case when v_answer then v_yes else v_no end, v_yes + v_no);
    update public.picks
       set correct = (answer = v_answer),
           base_points = case when answer = v_answer then v_q.points else 0 end,
           bonus_points = case when answer = v_answer then v_bonus else 0 end
     where question_id = p_question_id;
  end if;

  update public.slates s
     set graded_at = now()
   where s.id = v_q.slate_id
     and s.graded_at is null
     and not exists (
       select 1 from public.questions q
       where q.slate_id = s.id and q.included and q.result is null
     )
  returning true into v_done;

  return coalesce(v_done, false);
end;
$$;

revoke all on function public.settle_question(uuid, text, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.settle_question(uuid, text, numeric, text, boolean) to service_role;

-- Streak ----------------------------------------------------------------------

-- How many published slates in a row the signed-in player has made at least
-- one pick on, counting back from p_today (the US Eastern date). Days with no
-- slate (no games) do not break it. Today's slate only counts once picked, and
-- not having picked yet today does not break it.
create or replace function public.play_streak(p_today date)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row record;
  v_streak int := 0;
begin
  if v_user is null then
    return 0;
  end if;
  for v_row in
    select s.slate_date,
           exists (
             select 1 from public.picks p
             join public.questions q on q.id = p.question_id
             where q.slate_id = s.id and q.included and p.user_id = v_user
           ) as played
    from public.slates s
    where s.status = 'published' and s.slate_date <= p_today
    order by s.slate_date desc
  loop
    if v_row.played then
      v_streak := v_streak + 1;
    elsif v_row.slate_date = p_today and v_streak = 0 then
      continue;
    else
      exit;
    end if;
  end loop;
  return v_streak;
end;
$$;

revoke all on function public.play_streak(date) from public, anon;
grant execute on function public.play_streak(date) to authenticated;
