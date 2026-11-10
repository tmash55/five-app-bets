-- Checks that picks lock at game start (UNJ-1422). Run with run-local.sh; each block says what to expect.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','admin@x'),('00000000-0000-0000-0000-00000000000b','p1@x'),('00000000-0000-0000-0000-00000000000c','p2@x');
insert into public.admins values ('00000000-0000-0000-0000-00000000000a');
insert into public.slates (id, slate_date, status) values ('11111111-0000-0000-0000-000000000001', current_date, 'published'), ('11111111-0000-0000-0000-000000000002', current_date+1, 'draft');
insert into public.questions (id, slate_id, position, sport, game_id, game_label, starts_at, lock_at, prompt, generated_prompt, grading_rule, included) values
 ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',1,'nba','g1','A @ B', now()+interval '2 hours', now()+interval '2 hours','Will X score 25 or more?','Will X score 25 or more?','{}',true),
 ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001',2,'nba','g2','C @ D', now()-interval '1 minute', now()-interval '1 minute','Will Y score 20 or more?','Will Y score 20 or more?','{}',true),
 ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001',3,'nba','g3','E @ F', now()+interval '2 hours', now()+interval '2 hours','Will Z score 30 or more?','Will Z score 30 or more?','{}',false),
 ('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000002',1,'nba','g4','G @ H', now()+interval '1 day', now()+interval '1 day','Will W score 30 or more?','Will W score 30 or more?','{}',true);

\echo '--- default points'
select position, points from public.questions where slate_id='11111111-0000-0000-0000-000000000001' order by 1;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo '--- p1 picks Yes on open question (expect ok)'
select answer from public.make_pick('22222222-0000-0000-0000-000000000001', true);
\echo '--- p1 changes to No (expect ok, answer f)'
select answer from public.make_pick('22222222-0000-0000-0000-000000000001', false);
\echo '--- p1 picks on locked question (expect CI423)'
\set VERBOSITY verbose
select public.make_pick('22222222-0000-0000-0000-000000000002', true);
\set VERBOSITY default
\echo '--- dropped question (expect not on published slate)'
select public.make_pick('22222222-0000-0000-0000-000000000003', true);
\echo '--- draft slate question (expect not on published slate)'
select public.make_pick('22222222-0000-0000-0000-000000000004', true);
\echo '--- null answer (expect error)'
select public.make_pick('22222222-0000-0000-0000-000000000001', null);
\echo '--- direct insert (expect permission denied)'
insert into public.picks (user_id, question_id, answer) values ('00000000-0000-0000-0000-00000000000b','22222222-0000-0000-0000-000000000002',true);
\echo '--- direct update (expect permission denied)'
update public.picks set answer = true;
\echo '--- p1 sees own pick (1 row)'
select count(*) from public.picks;
\echo '--- server_now works'
select public.server_now() is not null as ok;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
\echo '--- p2 sees no picks (0)'
select count(*) from public.picks;
select set_config('request.jwt.claim.sub','',false);
\echo '--- signed out (expect Sign in)'
select public.make_pick('22222222-0000-0000-0000-000000000001', true);
reset role;
set role anon;
\echo '--- anon cannot call make_pick (permission denied)'
select public.make_pick('22222222-0000-0000-0000-000000000001', true);
reset role;
\echo '--- lock passes: move lock into the past as owner, then p1 tries to change (expect CI423)'
update public.questions set lock_at = now() - interval '1 second' where id='22222222-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select public.make_pick('22222222-0000-0000-0000-000000000001', true);
\echo '--- pick unchanged (f)'
select answer from public.picks;
reset role;
