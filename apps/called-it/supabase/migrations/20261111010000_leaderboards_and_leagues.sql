-- Called It: leaderboards, private leagues and the profile screen (UNJ-1424).
--
-- Everything here is read from the points UNJ-1423 writes on picks
-- (picks.points_earned, picks.correct), so scoring rules stay in one place
-- (scoring_settings and settle_question). Nothing here hard-codes points.
--
-- Players never read other players' picks. Leaderboards, league tables and
-- profile stats come from security definer functions that return totals only.

-- Display names ---------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Called It display names shown on leaderboards and league tables.';

alter table public.profiles enable row level security;
create policy "Players see their own profile"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.profiles to authenticated;

-- The name shown for a player who has not picked one: "Player 3F9A" (the
-- last 4 characters of their id, so it stays the same everywhere).
create or replace function public.player_label(p_user_id uuid, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_name, 'Player ' || upper(right(p_user_id::text, 4)));
$$;

create or replace function public.set_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 20 then
    raise exception 'Names are 2 to 20 characters.' using errcode = '22023';
  end if;
  if v_name !~ '^[A-Za-z0-9 ._''-]+$' then
    raise exception 'Use letters, numbers, spaces and . _ '' - only.' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name) values (v_user, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();
  return v_name;
end;
$$;

-- Pro (removes the league limit) ---------------------------------------------

-- Written only by the service role. UNJ-1426 adds the RevenueCat webhook that
-- fills it; until then nobody is Pro and free limits apply to everyone.
create table public.pro_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Null means no end date.
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.pro_members is 'Called It Pro players. Service role only; filled by the RevenueCat webhook (UNJ-1426).';

alter table public.pro_members enable row level security;
revoke all on public.pro_members from anon, authenticated;

create or replace function public.is_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_members
    where user_id = p_user_id and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.is_pro(uuid) from public, anon, authenticated;
grant execute on function public.is_pro(uuid) to service_role;

-- League limits ----------------------------------------------------------------

-- One row. Free players can create this many leagues (null = no limit) and
-- join this many (null = no limit). Pro players have no limit. Edit in the SQL editor.
create table public.league_settings (
  id boolean primary key default true check (id),
  free_max_owned int default 1 check (free_max_owned is null or free_max_owned >= 0),
  free_max_joined int check (free_max_joined is null or free_max_joined >= 0),
  updated_at timestamptz not null default now()
);
insert into public.league_settings default values;

comment on table public.league_settings is 'Called It league limits for free players. One row; edit to tune.';

alter table public.league_settings enable row level security;
revoke all on public.league_settings from anon, authenticated;

-- Leagues ------------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 30),
  -- Passes to the longest-standing member when the owner leaves or deletes their account.
  owner_id uuid references auth.users (id) on delete set null,
  -- 8 characters, no 0/O/1/I/L, used in the invite link.
  invite_code text not null unique check (invite_code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  -- The table counts slates from this date (US Eastern) on.
  season_start date not null,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_members_user_idx on public.league_members (user_id);
create index leagues_owner_idx on public.leagues (owner_id);

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = (select auth.uid())
  );
$$;

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

create policy "Members see their leagues"
  on public.leagues for select to authenticated
  using (public.is_league_member(id));
create policy "Members see who else is in their leagues"
  on public.league_members for select to authenticated
  using (public.is_league_member(league_id));

-- Reads only. All writes go through the functions below.
grant select on public.leagues, public.league_members to authenticated;

-- When someone leaves (or deletes their account): an empty league is deleted,
-- and a league whose owner left passes to the member who joined first.
create or replace function public.after_league_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  select user_id into v_next
  from public.league_members
  where league_id = old.league_id
  order by joined_at, user_id
  limit 1;

  if v_next is null then
    delete from public.leagues where id = old.league_id;
  else
    update public.leagues
       set owner_id = v_next
     where id = old.league_id
       and (owner_id is null or owner_id = old.user_id);
  end if;
  return null;
end;
$$;

create trigger league_member_removed
  after delete on public.league_members
  for each row execute function public.after_league_member_removed();

-- 8 random characters from an alphabet without look-alikes.
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.new_invite_code() from public, anon, authenticated;

create or replace function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.check_league_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 3 or char_length(v_name) > 30 then
    raise exception 'League names are 3 to 30 characters.' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- How many leagues the signed-in player owns and is in, and their limits.
-- Null max means no limit.
create or replace function public.my_league_allowance()
returns table (is_pro boolean, owned int, max_owned int, joined int, max_joined int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
       pro as (select public.is_pro(me.uid) as yes from me)
  select pro.yes,
         (select count(*)::int from public.leagues l, me where l.owner_id = me.uid),
         case when pro.yes then null else s.free_max_owned end,
         (select count(*)::int from public.league_members m, me where m.user_id = me.uid),
         case when pro.yes then null else s.free_max_joined end
  from pro, public.league_settings s;
$$;

-- Creates a league with the caller as owner and first member.
-- Raises CI424 when a free player is at their limit.
create or replace function public.create_league(p_name text)
returns table (id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := public.check_league_name(p_name);
  v_allow record;
  v_id uuid;
  v_code text;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- One create at a time per player, so two quick taps cannot both pass the limit.
  perform pg_advisory_xact_lock(hashtext('called-it-leagues:' || v_user::text));
  select * into v_allow from public.my_league_allowance();
  if v_allow.max_owned is not null and v_allow.owned >= v_allow.max_owned then
    raise exception 'Free players can create % league(s). Pro removes the limit.', v_allow.max_owned
      using errcode = 'CI424';
  end if;
  if v_allow.max_joined is not null and v_allow.joined >= v_allow.max_joined then
    raise exception 'Free players can be in % league(s). Pro removes the limit.', v_allow.max_joined
      using errcode = 'CI424';
  end if;

  v_code := public.new_invite_code();
  insert into public.leagues (name, owner_id, invite_code, season_start)
  values (v_name, v_user, v_code, (now() at time zone 'America/New_York')::date)
  returning leagues.id into v_id;
  insert into public.league_members (league_id, user_id) values (v_id, v_user);

  return query select v_id, v_code;
end;
$$;

-- What the invite screen shows before joining. Raises P0002 for an unknown code.
create or replace function public.league_preview(p_code text)
returns table (id uuid, name text, member_count int, is_member boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_league public.leagues;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_league from public.leagues l where l.invite_code = public.normalize_invite_code(p_code);
  if not found then
    raise exception 'That invite link is not valid any more.' using errcode = 'P0002';
  end if;
  return query
    select v_league.id, v_league.name,
           (select count(*)::int from public.league_members m where m.league_id = v_league.id),
           exists (select 1 from public.league_members m where m.league_id = v_league.id and m.user_id = v_user);
end;
$$;

-- Joins by invite code. Joining a league you are already in does nothing.
-- Raises P0002 for an unknown code and CI424 when a free player is at their limit.
create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_league_id uuid;
  v_allow record;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select l.id into v_league_id from public.leagues l where l.invite_code = public.normalize_invite_code(p_code);
  if v_league_id is null then
    raise exception 'That invite link is not valid any more.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.league_members where league_id = v_league_id and user_id = v_user) then
    return v_league_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('called-it-leagues:' || v_user::text));
  select * into v_allow from public.my_league_allowance();
  if v_allow.max_joined is not null and v_allow.joined >= v_allow.max_joined then
    raise exception 'Free players can be in % league(s). Pro removes the limit.', v_allow.max_joined
      using errcode = 'CI424';
  end if;

  insert into public.league_members (league_id, user_id) values (v_league_id, v_user)
  on conflict do nothing;
  return v_league_id;
end;
$$;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.league_members
  where league_id = p_league_id and user_id = (select auth.uid());
end;
$$;

-- Owner only.
create or replace function public.rename_league(p_league_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.check_league_name(p_name);
begin
  update public.leagues set name = v_name
  where id = p_league_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'Only the league owner can rename it.' using errcode = '42501';
  end if;
  return v_name;
end;
$$;

-- Scoring totals ------------------------------------------------------------------

-- Points, correct picks and graded picks per player on published slates in a
-- date range. Void picks count for neither correct nor graded. Internal only.
create or replace function public.player_totals(p_from date, p_to date)
returns table (user_id uuid, points bigint, correct bigint, graded bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id,
         sum(p.points_earned)::bigint,
         count(*) filter (where p.correct),
         count(p.correct)
  from public.picks p
  join public.questions q on q.id = p.question_id
  join public.slates s on s.id = q.slate_id
  where s.status = 'published'
    and q.included
    and q.result is not null
    and (p_from is null or s.slate_date >= p_from)
    and (p_to is null or s.slate_date <= p_to)
  group by p.user_id;
$$;

revoke all on function public.player_totals(date, date) from public, anon, authenticated;

-- Leaderboards ------------------------------------------------------------------

-- p_scope: 'global' (everyone with a graded pick in the period) or 'friends'
-- (everyone who shares a league with you). p_period: 'week' (Monday to
-- Sunday, US Eastern, containing p_today) or 'all'. Returns the top p_limit
-- rows plus your own row wherever you are. Ties share a rank.
create or replace function public.leaderboard(p_scope text, p_period text, p_today date, p_limit int default 100)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  points bigint,
  correct bigint,
  graded bigint,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_from date;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_scope not in ('global', 'friends') or p_period not in ('week', 'all') then
    raise exception 'Unknown leaderboard.' using errcode = '22023';
  end if;
  v_from := case when p_period = 'week' then date_trunc('week', p_today)::date end;

  return query
  with totals as (
    select * from public.player_totals(v_from, p_today)
  ),
  pool as (
    select v_user as uid
    union
    select t.user_id from totals t where p_scope = 'global'
    union
    select other.user_id
    from public.league_members mine
    join public.league_members other on other.league_id = mine.league_id
    where p_scope = 'friends' and mine.user_id = v_user
  ),
  scored as (
    select pool.uid,
           coalesce(t.points, 0) as points,
           coalesce(t.correct, 0) as correct,
           coalesce(t.graded, 0) as graded
    from pool left join totals t on t.user_id = pool.uid
  ),
  ranked as (
    select s.*, rank() over (order by s.points desc) as rnk from scored s
  )
  select r.rnk, r.uid, public.player_label(r.uid, pr.display_name), r.points, r.correct, r.graded, r.uid = v_user
  from ranked r
  left join public.profiles pr on pr.user_id = r.uid
  where r.rnk <= greatest(coalesce(p_limit, 100), 1) or r.uid = v_user
  order by r.rnk, r.correct desc, 3;
end;
$$;

-- A league's season table: every member, ranked by points since the league's
-- season_start. Members only.
create or replace function public.league_table(p_league_id uuid, p_today date)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  points bigint,
  correct bigint,
  graded bigint,
  is_me boolean,
  is_owner boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_league public.leagues;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not in this league.' using errcode = '42501';
  end if;
  select * into v_league from public.leagues where id = p_league_id;

  return query
  with totals as (
    select * from public.player_totals(v_league.season_start, p_today)
  ),
  scored as (
    select m.user_id as uid,
           coalesce(t.points, 0) as points,
           coalesce(t.correct, 0) as correct,
           coalesce(t.graded, 0) as graded
    from public.league_members m
    left join totals t on t.user_id = m.user_id
    where m.league_id = p_league_id
  )
  select rank() over (order by s.points desc),
         s.uid, public.player_label(s.uid, pr.display_name), s.points, s.correct, s.graded,
         s.uid = v_user, s.uid = v_league.owner_id
  from scored s
  left join public.profiles pr on pr.user_id = s.uid
  order by 1, s.correct desc, 3;
end;
$$;

-- The Leagues tab: each league you are in with your place in it.
create or replace function public.my_leagues(p_today date)
returns table (
  id uuid,
  name text,
  invite_code text,
  season_start date,
  member_count int,
  is_owner boolean,
  my_rank bigint,
  my_points bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_league record;
  v_me record;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  for v_league in
    select l.* from public.leagues l
    join public.league_members m on m.league_id = l.id and m.user_id = v_user
    order by m.joined_at
  loop
    select t.rank, t.points into v_me
    from public.league_table(v_league.id, p_today) t
    where t.is_me;
    id := v_league.id;
    name := v_league.name;
    invite_code := v_league.invite_code;
    season_start := v_league.season_start;
    member_count := (select count(*)::int from public.league_members m where m.league_id = v_league.id);
    is_owner := v_league.owner_id = v_user;
    my_rank := v_me.rank;
    my_points := v_me.points;
    return next;
  end loop;
end;
$$;

-- Profile -------------------------------------------------------------------------

-- The signed-in player's record and the counts the badges are worked out from.
-- by_sport: [{sport, graded, correct, voided, points, bonus_picks}]
create or replace function public.profile_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  mine as (
    select q.sport, q.slate_id, p.correct, p.points_earned, p.bonus_points, q.result
    from public.picks p
    join public.questions q on q.id = p.question_id
    join public.slates s on s.id = q.slate_id
    join me on p.user_id = me.uid
    where s.status = 'published' and q.included
  ),
  by_sport as (
    select sport,
           count(correct) as graded,
           count(*) filter (where correct) as correct,
           count(*) filter (where result = 'void') as voided,
           coalesce(sum(points_earned), 0) as points,
           count(*) filter (where bonus_points > 0) as bonus_picks
    from mine
    group by sport
  ),
  -- A perfect slate: the slate is fully graded, the player picked every
  -- included question, at least 3 of them had a result, and every one of those was right.
  perfect as (
    select s.id
    from public.slates s
    join public.questions q on q.slate_id = s.id and q.included
    left join public.picks p on p.question_id = q.id and p.user_id = (select uid from me)
    where s.status = 'published' and s.graded_at is not null
    group by s.id
    having count(p.question_id) = count(*)
       and count(p.correct) >= 3
       and bool_and(coalesce(p.correct, true))
  ),
  -- Longest run of published slates in a row the player picked on (the same
  -- rule as play_streak), for the streak badge, which is kept once earned.
  slate_days as (
    select s.slate_date,
           exists (
             select 1 from public.picks p
             join public.questions q on q.id = p.question_id
             where q.slate_id = s.id and q.included and p.user_id = (select uid from me)
           ) as played
    from public.slates s
    where s.status = 'published'
  ),
  runs as (
    select played,
           row_number() over (order by slate_date) - row_number() over (partition by played order by slate_date) as run
    from slate_days
  )
  select jsonb_build_object(
    'best_streak', coalesce((select max(n) from (select count(*) as n from runs where played group by run) r), 0),
    'by_sport', coalesce((select jsonb_agg(to_jsonb(b) order by b.sport) from by_sport b), '[]'::jsonb),
    'slates_played', (select count(distinct slate_id) from mine),
    'perfect_slates', (select count(*) from perfect),
    'leagues_owned', (select count(*) from public.leagues l, me where l.owner_id = me.uid),
    'leagues_joined', (select count(*) from public.league_members m, me where m.user_id = me.uid)
  );
$$;

-- Grants --------------------------------------------------------------------------

revoke all on function public.player_label(uuid, text) from public, anon;
revoke all on function public.set_display_name(text) from public, anon;
revoke all on function public.is_league_member(uuid) from public, anon;
revoke all on function public.after_league_member_removed() from public, anon, authenticated;
revoke all on function public.normalize_invite_code(text) from public, anon;
revoke all on function public.check_league_name(text) from public, anon;
revoke all on function public.my_league_allowance() from public, anon;
revoke all on function public.create_league(text) from public, anon;
revoke all on function public.league_preview(text) from public, anon;
revoke all on function public.join_league(text) from public, anon;
revoke all on function public.leave_league(uuid) from public, anon;
revoke all on function public.rename_league(uuid, text) from public, anon;
revoke all on function public.leaderboard(text, text, date, int) from public, anon;
revoke all on function public.league_table(uuid, date) from public, anon;
revoke all on function public.my_leagues(date) from public, anon;
revoke all on function public.profile_stats() from public, anon;

grant execute on function
  public.player_label(uuid, text),
  public.set_display_name(text),
  public.is_league_member(uuid),
  public.normalize_invite_code(text),
  public.check_league_name(text),
  public.my_league_allowance(),
  public.create_league(text),
  public.league_preview(text),
  public.join_league(text),
  public.leave_league(uuid),
  public.rename_league(uuid, text),
  public.leaderboard(text, text, date, int),
  public.league_table(uuid, date),
  public.my_leagues(date),
  public.profile_stats()
to authenticated;
