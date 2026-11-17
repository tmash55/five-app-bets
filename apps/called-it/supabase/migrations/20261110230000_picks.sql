-- Called It: players' yes/no picks, locked at game start (UNJ-1422).
--
-- Players never write to `picks` directly. The only way in is `make_pick`,
-- which checks the question is on a published slate and that its lock time
-- has not passed, using the database clock. So a pick cannot be made or
-- changed after the game starts, whatever the phone's clock says.

-- Points a correct pick earns before any bonus (UNJ-1423 adds the bonus for
-- less popular correct picks). Every question starts at 10.
alter table public.questions
  add column points int not null default 10 check (points between 1 and 100);

create table public.picks (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  -- true = Yes, false = No.
  answer boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index picks_question_id_idx on public.picks (question_id);

comment on table public.picks is
  'One yes/no pick per player per question. Written only through make_pick, which refuses after lock_at.';

create trigger picks_touch_updated_at
before update on public.picks
for each row execute function public.touch_updated_at();

alter table public.picks enable row level security;

create policy "Players see their own picks"
on public.picks for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.picks from anon, authenticated;
grant select on public.picks to authenticated;

-- Making and changing picks ---------------------------------------------------

create or replace function public.make_pick(p_question_id uuid, p_answer boolean)
returns public.picks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_lock_at timestamptz;
  v_pick public.picks;
begin
  if v_user is null then
    raise exception 'Sign in to make picks.' using errcode = '42501';
  end if;
  if p_answer is null then
    raise exception 'Pick Yes or No.' using errcode = '22023';
  end if;

  -- Lock the question row so an admin edit and a pick cannot interleave.
  select q.lock_at into v_lock_at
  from public.questions q
  join public.slates s on s.id = q.slate_id
  where q.id = p_question_id and q.included and s.status = 'published'
  for share of q;
  if not found then
    raise exception 'That question is not on a published slate.' using errcode = 'P0002';
  end if;

  if now() >= v_lock_at then
    -- 'CI423' is the code the app checks for (see src/today/api.ts).
    raise exception 'This game has started, so the pick is locked.' using errcode = 'CI423';
  end if;

  insert into public.picks (user_id, question_id, answer)
  values (v_user, p_question_id, p_answer)
  on conflict (user_id, question_id) do update set answer = excluded.answer
  returning * into v_pick;
  return v_pick;
end;
$$;

revoke all on function public.make_pick(uuid, boolean) from public, anon;
grant execute on function public.make_pick(uuid, boolean) to authenticated;

-- The database clock, so the app's countdown matches the lock that is enforced.
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
