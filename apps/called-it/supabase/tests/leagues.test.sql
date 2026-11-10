-- Checks leaderboards, private leagues and profile stats (UNJ-1424). Run with run-local.sh; each block says what to expect.
-- The issue's done check: two accounts join the same league by link and see each other ranked after a graded slate.
\set ON_ERROR_STOP 0
\set ana '''00000000-0000-0000-0000-0000000002a1'''
\set ben '''00000000-0000-0000-0000-0000000002b1'''
\set cal '''00000000-0000-0000-0000-0000000002c1'''
\set dee '''00000000-0000-0000-0000-0000000002d1'''
insert into auth.users values (:ana, 'ana@x'), (:ben, 'ben@x'), (:cal, 'cal@x'), (:dee, 'dee@x');

-- Last week's slate (counts for all time, not this week) and today's slate.
insert into public.slates (id, slate_date, status) values
 ('55555555-0000-0000-0000-000000000001', current_date - 8, 'published'),
 ('55555555-0000-0000-0000-000000000002', current_date, 'published');
insert into public.questions (id, slate_id, position, sport, game_id, game_label, starts_at, lock_at, prompt, generated_prompt, grading_rule, included) values
 ('66666666-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000001',1,'nfl','1','A @ B', now()-interval '8 days', now()-interval '8 days','Old question','x','{}',true),
 ('66666666-0000-0000-0000-000000000002','55555555-0000-0000-0000-000000000002',1,'nba','2','C @ D', now()-interval '1 hour', now()-interval '1 hour','Will C score 25 or more?','x','{}',true),
 ('66666666-0000-0000-0000-000000000003','55555555-0000-0000-0000-000000000002',2,'nba','3','E @ F', now()-interval '1 hour', now()-interval '1 hour','Will E score 25 or more?','x','{}',true),
 ('66666666-0000-0000-0000-000000000004','55555555-0000-0000-0000-000000000002',3,'nfl','4','G @ H', now()-interval '1 hour', now()-interval '1 hour','Will G throw for 250 or more?','x','{}',true);
-- Cal won big last week (outside this week). Today: Ana picks all Yes, Ben all No, Dee picks Yes on Q2 only.
insert into public.picks (user_id, question_id, answer) values
 (:cal, '66666666-0000-0000-0000-000000000001', true),
 (:ana, '66666666-0000-0000-0000-000000000002', true),
 (:ana, '66666666-0000-0000-0000-000000000003', true),
 (:ana, '66666666-0000-0000-0000-000000000004', true),
 (:ben, '66666666-0000-0000-0000-000000000002', false),
 (:ben, '66666666-0000-0000-0000-000000000003', false),
 (:ben, '66666666-0000-0000-0000-000000000004', false),
 (:dee, '66666666-0000-0000-0000-000000000002', true);

set role authenticated;

\echo '--- signed out: cannot create a league (expect Sign in first)'
select set_config('request.jwt.claim.sub', '', false);
select * from public.create_league('Nope');

\echo '--- Ana: bad names are refused (expect 3 to 30 characters, twice)'
select set_config('request.jwt.claim.sub', :ana, false);
select * from public.create_league('ab');
select * from public.create_league(repeat('x', 31));

\echo '--- Ana creates "Sunday Crew"; the invite code is 8 characters'
select id as league_id, invite_code as code from public.create_league('  Sunday   Crew ') \gset
select name, char_length(invite_code) as code_len, owner_id = :ana as ana_owns, season_start = (now() at time zone 'America/New_York')::date as starts_today
from public.leagues where id = :'league_id';

\echo '--- Ana: a second league is over the free limit (expect CI424)'
select * from public.create_league('Second League');
\echo '--- Ana allowance: not pro, owns 1 of 1, joined 1, no join limit'
select * from public.my_league_allowance();

\echo '--- Ana names herself (bad names refused first)'
select public.set_display_name('A');
select public.set_display_name('<script>');
select public.set_display_name('  Ana   B ');

\echo '--- Ben: cannot see the league before joining (0 rows), but the invite link previews it'
select set_config('request.jwt.claim.sub', :ben, false);
select count(*) as visible from public.leagues;
select name, member_count, is_member from public.league_preview(lower(:'code'));
\echo '--- Ben: a bad code (expect not valid any more)'
select public.join_league('ZZZZZZZZ');
\echo '--- Ben joins by link (lower case with a dash still works), twice is fine'
select public.join_league(lower(substr(:'code', 1, 4)) || '-' || substr(:'code', 5)) = :'league_id'::uuid as joined;
select public.join_league(:'code') = :'league_id'::uuid as joined_again;
select count(*) as members from public.league_members where league_id = :'league_id';
\echo '--- Ben cannot rename it (expect only the owner)'
select public.rename_league(:'league_id', 'Bens League');
\echo '--- Ben cannot write tables directly (expect permission denied x3)'
insert into public.league_members (league_id, user_id) values (:'league_id', :cal);
update public.leagues set owner_id = :ben;
insert into public.profiles values (:ben, 'Hacker');
\echo '--- Ben cannot read Ana''s profile row or picks (0, 0)'
select count(*) from public.profiles;
select count(*) from public.picks where user_id = :ana;

\echo '--- before grading: league table has both at 0 points, tied at rank 1'
select rank, display_name, points, graded, is_me, is_owner from public.league_table(:'league_id', current_date);

\echo '--- Cal is not a member: cannot read the table (expect not in this league)'
select set_config('request.jwt.claim.sub', :cal, false);
select * from public.league_table(:'league_id', current_date);

-- Grade today's slate as the grader does (service role): Q2 yes, Q3 no, Q4 void.
reset role;
select public.settle_question('66666666-0000-0000-0000-000000000001', 'yes', 30);
select public.settle_question('66666666-0000-0000-0000-000000000002', 'yes', 30);
select public.settle_question('66666666-0000-0000-0000-000000000003', 'no', 10);
select public.settle_question('66666666-0000-0000-0000-000000000004', 'void', null, 'Game postponed');
set role authenticated;

\echo '=== DONE CHECK: after grading Ana (10 pts, 1 of 2) and Ben (10 pts, 1 of 2) both see each other ranked'
select set_config('request.jwt.claim.sub', :ana, false);
select rank, display_name, points, correct, graded, is_me, is_owner from public.league_table(:'league_id', current_date);
select set_config('request.jwt.claim.sub', :ben, false);
select rank, display_name, points, correct, graded, is_me, is_owner from public.league_table(:'league_id', current_date);

\echo '--- Ben''s leagues list: Sunday Crew, 2 members, rank 1, 10 pts, not owner'
select name, member_count, is_owner, my_rank, my_points from public.my_leagues(current_date);

\echo '--- Global this week: Ana, Ben, Dee all 10 (Cal''s points were last week)'
select rank, display_name, points, is_me from public.leaderboard('global', 'week', current_date);
\echo '--- Global all time: Ana, Ben, Cal (last week) and Dee, all 10, tied at rank 1'
select rank, display_name, points, is_me from public.leaderboard('global', 'all', current_date);
\echo '--- Global with limit 1: rank 1 is a four-way tie, so all four show'
select rank, display_name, is_me from public.leaderboard('global', 'all', current_date, 1);
\echo '--- Friends: only Ana and Ben (shared league), not Cal or Dee'
select rank, display_name, points, is_me from public.leaderboard('friends', 'all', current_date);
\echo '--- Unknown board (expect Unknown leaderboard)'
select * from public.leaderboard('mars', 'all', current_date);

\echo '--- Ana profile: nba graded 2 correct 1 (10 pts), nfl voided 1; 1 slate played; no perfect slate'
select set_config('request.jwt.claim.sub', :ana, false);
select jsonb_pretty(public.profile_stats());
\echo '--- Cal profile: 1 slate played, 1 perfect slate? no (needs 3 graded picks) -> 0'
select set_config('request.jwt.claim.sub', :cal, false);
select public.profile_stats() -> 'perfect_slates' as perfect, public.profile_stats() -> 'slates_played' as played;
\echo '--- Cal this week, limit 1: the three tied at rank 1, then Cal''s own row at rank 4 with 0'
select rank, display_name, points, is_me from public.leaderboard('global', 'week', current_date, 1);
\echo '--- Friends board for a player with no leagues: just themselves'
select rank, display_name, points, is_me from public.leaderboard('friends', 'all', current_date);

\echo '--- Pro removes the create limit (service role marks Ana Pro)'
reset role;
insert into public.pro_members (user_id) values (:ana);
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, false);
select (select count(*) from public.create_league('Second League')) as created;
select is_pro, owned, max_owned from public.my_league_allowance();
\echo '--- expired Pro is free again (expect CI424)'
reset role;
update public.pro_members set expires_at = now() - interval '1 day' where user_id = :ana;
set role authenticated;
select * from public.create_league('Third League');

\echo '--- join limit when set (service role sets free_max_joined = 1): Dee can join one, not two'
reset role;
update public.league_settings set free_max_joined = 1;
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, false);
select invite_code as code2 from public.leagues where name = 'Second League' \gset
select set_config('request.jwt.claim.sub', :dee, false);
select public.join_league(:'code') is not null as joined_first;
select public.join_league(:'code2');
reset role;
update public.league_settings set free_max_joined = null;
set role authenticated;

\echo '--- Ana leaves Sunday Crew: Ben (joined next) becomes owner'
select set_config('request.jwt.claim.sub', :ana, false);
select public.leave_league(:'league_id');
reset role;
select owner_id = :ben as ben_owns from public.leagues where id = :'league_id';
\echo '--- Ben deletes his account: Dee becomes owner; Ben''s profile-less row is gone'
delete from auth.users where id = :ben;
select owner_id = :dee as dee_owns, (select count(*) from public.league_members where league_id = :'league_id') as members from public.leagues where id = :'league_id';
\echo '--- Dee leaves: the empty league is deleted (0)'
set role authenticated;
select set_config('request.jwt.claim.sub', :dee, false);
select public.leave_league(:'league_id');
reset role;
select count(*) as left_over from public.leagues where id = :'league_id';
