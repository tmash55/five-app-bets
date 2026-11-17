-- Checks grading, points and the streak (UNJ-1423). Run with run-local.sh; each block says what to expect.
\set ON_ERROR_STOP 0
-- Players p01..p12. Admin owns nothing here.
insert into auth.users select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'g' || i || '@x' from generate_series(1, 12) i;
insert into public.slates (id, slate_date, status) values
 ('33333333-0000-0000-0000-000000000001', current_date - 3, 'published'),
 ('33333333-0000-0000-0000-000000000002', current_date - 2, 'published'),
 ('33333333-0000-0000-0000-000000000003', current_date - 1, 'published'),
 ('33333333-0000-0000-0000-000000000004', current_date + 5, 'published');
insert into public.questions (id, slate_id, position, sport, game_id, game_label, starts_at, lock_at, prompt, generated_prompt, grading_rule, included) values
 ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000003',1,'nba','1','A @ B', now()-interval '5 hours', now()-interval '5 hours','Will A score 25 or more?','x','{}',true),
 ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000003',2,'nba','2','C @ D', now()-interval '5 hours', now()-interval '5 hours','Will C score 25 or more?','x','{}',true),
 ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000003',3,'nba','3','E @ F', now()-interval '5 hours', now()-interval '5 hours','Will E score 25 or more?','x','{}',true),
 ('44444444-0000-0000-0000-000000000009','33333333-0000-0000-0000-000000000003',4,'nba','3','E @ F', now()-interval '5 hours', now()-interval '5 hours','Dropped question here','x','{}',false),
 ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000004',1,'nba','4','G @ H', now()+interval '5 days', now()+interval '5 days','Will G score 25 or more?','x','{}',true),
 ('44444444-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000001',1,'nba','5','I @ J', now()-interval '3 days', now()-interval '3 days','Will I score 25 or more?','x','{}',true),
 ('44444444-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000002',1,'nba','6','K @ L', now()-interval '2 days', now()-interval '2 days','Will K score 25 or more?','x','{}',true);
-- Q1: 2 of 12 pick Yes (17%). Q2: 5 of 12 pick Yes (42%). Q3: everyone picks Yes. Player n = i.
insert into public.picks (user_id, question_id, answer)
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, '44444444-0000-0000-0000-000000000001'::uuid, i <= 2 from generate_series(1, 12) i
union all
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, '44444444-0000-0000-0000-000000000002'::uuid, i <= 5 from generate_series(1, 12) i
union all
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, '44444444-0000-0000-0000-000000000003'::uuid, true from generate_series(1, 12) i;
-- Streak history for p01: picked 3 days ago, skipped 2 days ago. p02 picked both.
insert into public.picks (user_id, question_id, answer) values
 ('00000000-0000-0000-0000-000000000101','44444444-0000-0000-0000-000000000005',true),
 ('00000000-0000-0000-0000-000000000102','44444444-0000-0000-0000-000000000005',true),
 ('00000000-0000-0000-0000-000000000102','44444444-0000-0000-0000-000000000006',true);

\echo '--- bonus tiers: 2 of 12 -> 10, 5 of 12 -> 5, 6 of 12 -> 0, 1 of 3 (too few picks) -> 0'
select public.pick_bonus(2, 12) as b17, public.pick_bonus(5, 12) as b42, public.pick_bonus(6, 12) as b50, public.pick_bonus(1, 3) as few;

\echo '--- settle before lock (expect not locked yet)'
select public.settle_question('44444444-0000-0000-0000-000000000004', 'yes', 30);
\echo '--- bad result (expect error)'
select public.settle_question('44444444-0000-0000-0000-000000000001', 'maybe', 30);

\echo '--- Q1 yes (unpopular): returns f, slate not done'
select public.settle_question('44444444-0000-0000-0000-000000000001', 'yes', 31);
\echo '--- Q1 picks: 2 correct with 10+10, 10 wrong with 0'
select correct, base_points, bonus_points, points_earned, count(*) from public.picks where question_id = '44444444-0000-0000-0000-000000000001' group by 1,2,3,4 order by 1;
\echo '--- Q1 counts: yes 2, no 10'
select result, result_value, yes_picks, no_picks, graded_at is not null as graded from public.questions where id = '44444444-0000-0000-0000-000000000001';

\echo '--- Q2 no (the No side was 58%, no bonus): 7 correct with 10+0'
select public.settle_question('44444444-0000-0000-0000-000000000002', 'no', 18);
select correct, base_points, bonus_points, count(*) from public.picks where question_id = '44444444-0000-0000-0000-000000000002' group by 1,2,3 order by 1;

\echo '--- slate not graded yet (f)'
select graded_at is not null from public.slates where id = '33333333-0000-0000-0000-000000000003';
\echo '--- Q3 void: returns t (last open included question; the dropped one does not count)'
select public.settle_question('44444444-0000-0000-0000-000000000003', 'void', 40, 'Game postponed');
select result, result_value, void_reason from public.questions where id = '44444444-0000-0000-0000-000000000003';
\echo '--- Q3 picks: correct null, 0 points (12 rows)'
select correct, points_earned, count(*) from public.picks where question_id = '44444444-0000-0000-0000-000000000003' group by 1,2;
\echo '--- slate graded (t)'
select graded_at is not null from public.slates where id = '33333333-0000-0000-0000-000000000003';

\echo '--- settling again is a no-op (f), result stays yes'
select public.settle_question('44444444-0000-0000-0000-000000000001', 'no', 10);
select result from public.questions where id = '44444444-0000-0000-0000-000000000001';
\echo '--- forced correction to no: the 10 No pickers now earn 10, no bonus (No was 83%)'
select public.settle_question('44444444-0000-0000-0000-000000000001', 'no', 24, null, true);
select correct, base_points, bonus_points, count(*) from public.picks where question_id = '44444444-0000-0000-0000-000000000001' group by 1,2,3 order by 1;

\echo '--- p01 total on the slate: Q1 now wrong (0) + Q2 wrong (picked Yes, 0) + void = 0'
select sum(points_earned) from public.picks p join public.questions q on q.id = p.question_id where q.slate_id = '33333333-0000-0000-0000-000000000003' and p.user_id = '00000000-0000-0000-0000-000000000101';
\echo '--- p12 total: Q1 10 + Q2 10 = 20'
select sum(points_earned) from public.picks p join public.questions q on q.id = p.question_id where q.slate_id = '33333333-0000-0000-0000-000000000003' and p.user_id = '00000000-0000-0000-0000-000000000112';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',false);
\echo '--- player cannot settle (permission denied)'
select public.settle_question('44444444-0000-0000-0000-000000000001', 'yes', 30);
\echo '--- player cannot read scoring settings (permission denied)'
select * from public.scoring_settings;
\echo '--- player cannot change points on own pick (permission denied)'
update public.picks set bonus_points = 100;
\echo '--- player sees own graded picks (3 rows, with points columns)'
select count(*), count(correct) from public.picks where question_id in ('44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002','44444444-0000-0000-0000-000000000003');
\echo '--- p01 streak: yesterday played, 2 days ago skipped -> 1'
select public.play_streak(current_date);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false);
\echo '--- p02 streak: played 3 slates in a row -> 3'
select public.play_streak(current_date);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000105',false);
\echo '--- p05 streak: only yesterday -> 1'
select public.play_streak(current_date);
select set_config('request.jwt.claim.sub','',false);
\echo '--- signed out streak -> 0'
select public.play_streak(current_date);
reset role;
