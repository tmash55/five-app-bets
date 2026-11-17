# Called It

Sports predictions: each night players answer 5 to 10 yes/no questions about
tonight's NBA and NFL games. Built on the shared shell (`packages/shell`).

## Nightly slate (UNJ-1421)

```
Unjuiced (read only)                 Called It Supabase project
nba_hit_rate_profiles_v2  ─┐
nfl_hit_rate_profiles     ─┼─▶ generate-slate ─▶ slates / questions / question_stat_lines (draft)
nfl_games                 ─┘    Edge Function            │
                                                        ▼
                                  Review screen (admins): reword, drop, approve and publish
```

- **Generator** (`supabase/functions/_shared/slate/`): plain TypeScript, no
  runtime imports, so the Edge Function, the app and Jest share it. It keeps
  props with live odds in the markets listed in `markets.ts`, drops injured
  players, started games and lopsided lines (no-vig chance outside 30–70%),
  then picks well-known players on near coin-flip lines, one question per
  player, spread across games and markets. Target 8, never more than 10.
- **Question**: "Will Jalen Brunson score 27 or more points?" A half-point
  line of 26.5 becomes "27 or more". Whole-number lines are skipped (they can push).
- **Stat line** (Pro): "27+ points in 5 of last 10 games · averaging 28.1",
  from the hit-rate row's last 10 game logs.
- **Lock time**: game start. NBA from `game_status` ("7:30 pm ET"), NFL from
  `nfl_games.scheduled_at`.
- **Grading rule** (`grading_rule` jsonb, read by UNJ-1423): sum `stats` from
  `source_table` for `player_id` in `game_id`; "Yes" when the sum is at least
  `threshold`; void if the player does not play.

Try it on saved real data without any keys: `npx jest __tests__/slate.generate.test.ts`.

### Database

`supabase/migrations/20261110213000_slates_and_questions.sql` creates the
tables, row level security and two functions:

- `replace_draft_slate(date, notes, questions)`: service role only. Replaces
  the draft for a date; refuses once that date is published.
- `publish_slate(slate_id)`: admins only. Needs 5 to 10 included questions,
  none of them locked.

Players see only included questions on published slates. Stat lines are
admin-only until UNJ-1426 adds the Pro policy on `question_stat_lines`.
Admins can change only a question's wording and whether it is included.

### Setup once the Called It Supabase project exists

```bash
cd apps/called-it
npx supabase link --project-ref <called-it-ref>
npx supabase db push
npx supabase secrets set \
  UNJUICED_SUPABASE_URL=https://<unjuiced-ref>.supabase.co \
  UNJUICED_SUPABASE_READ_KEY=<key that can read the three tables>
npx supabase functions deploy generate-slate
```

`nfl_hit_rate_profiles` and `nfl_games` are readable with the Unjuiced anon key,
but `nba_hit_rate_profiles_v2` is not (RLS on, no policy), so the read key must
be one that can read it. A read-only key is safest.

Make yourself an admin (SQL editor, Called It project):

```sql
insert into public.admins (user_id)
select id from auth.users where email = '<your email>';
```

Run the generator every morning (SQL editor; needs the `pg_cron` and `pg_net`
extensions and the service role key in Vault as `service_role_key`):

```sql
select cron.schedule(
  'generate-called-it-slate',
  '0 16 * * *',  -- 11:00 ET in winter, 12:00 ET in summer
  $$
  select net.http_post(
    url := 'https://<called-it-ref>.supabase.co/functions/v1/generate-slate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The function accepts the legacy JWT service role key. With the newer
`sb_secret_...` keys, set `verify_jwt = false` for `generate-slate` in
`supabase/config.toml`; the function checks the caller itself.

Admins open the slate from the Today tab ("Review tonight's slate"), fix
anything, and tap **Approve and publish**.

## Today screen and picks (UNJ-1422)

The Today tab (`src/app/(tabs)/index.tsx`) shows today's published slate
(US Eastern date): one card per question with league, start time and points,
Yes and No buttons, a progress bar ("2 of 5 picked") and a countdown to the
next lock. With no published slate it shows "No questions today".

- **Locking is enforced by the database.** `supabase/migrations/20261110230000_picks.sql`
  adds `picks` (one row per player per question). Players can only read their
  own rows and cannot write the table; the only way in is
  `make_pick(question_id, answer)`, which refuses questions that are not on a
  published slate and raises `CI423` once `now() >= lock_at`. A pick can be
  changed as often as the player likes until then.
- **The countdown uses the database clock.** `server_now()` gives the offset
  from the phone's clock, so a phone set wrong does not show a card as open
  after the server has locked it. If the server still refuses a pick, the
  card flips to locked and the pick is undone.
- **Points**: `questions.points`, 10 per question for now. The bonus for less
  popular correct picks is part of grading (UNJ-1423).

Check the lock rules on a throwaway local Postgres (not a Supabase project):

```bash
supabase/tests/run-local.sh   # drops and recreates the called_it_test database
```

## Grading, points and results (UNJ-1423)

```
Unjuiced (read only)                         Called It
nba_games, nba_player_box_scores  ─┐
nfl_games, nfl_player_game_logs   ─┼─▶ grade-slates ─▶ settle_question ─▶ questions.result, picks.points
                                   │   (every 15 min)          │
                                   │                           └─▶ slates.graded_at ─▶ send-push "Your results are in"
```

- **Grading** (`supabase/functions/_shared/grading/`, plain TypeScript shared
  with Jest): each started question with no result is graded from its stored
  `grading_rule`. Sum the rule's `stats` for the player; "Yes" when the sum is
  at least `threshold`.
- **Void** instead of a result when the game is postponed, cancelled or
  suspended; when the player did not play (no box score row, no minutes, or
  `played = false`), checked only 6 hours after the start so a half-written box
  score is not read as a DNP; or when there is still no final result 36 hours
  after the start. Void picks score nothing either way. Timings are in
  `GRADING_CONFIG`.
- **Unknown rules** are never guessed: they are listed under `errors` in the
  function's response and stay open for a person.
- **Points** (`settle_question`, in `migrations/20261111000000_grading.sql`):
  a correct pick earns `questions.points` (10 for now) plus a bonus when fewer
  players picked that answer: +10 under 25% of the picks, +5 under 50%, and no
  bonus on a question with fewer than 10 picks. Those numbers live in the
  one-row `scoring_settings` table, so they can be tuned in the SQL editor.
  The pick split is saved on the question (`yes_picks`, `no_picks`).
  A wrong result can be corrected with
  `select settle_question('<question id>', 'no', 24, null, true);`, which
  rescores every pick on it.
- **Results push**: when a slate's last question is settled, `grade-slates`
  calls `send-push` (from the shared template, UNJ-1418) for everyone who
  picked on it, opening `/results?date=<slate date>`. A slate that finishes
  overnight waits until 9 am Eastern (no pushes 11 pm to 9 am). If the push
  fails, the next run tries again.
- **Results screen** (`src/app/results.tsx`, "See your results" on Today):
  points, record, bonus points and streak, then each question with Called it,
  Missed, Void or Pending, the final stat and how the crowd picked. Without a
  date it shows today's slate once anything on it is graded, else the latest
  earlier one.
- **Streak**: `play_streak(today)` counts published slates in a row the player
  picked on. Days without a slate do not break it, and not having picked yet
  today does not either.

Set up (after the slate setup above):

```bash
npx supabase db push
npx supabase secrets set UNJUICED_SUPABASE_READ_KEY=<key that can also read nba_games, nba_player_box_scores, nfl_player_game_logs>
npx supabase functions deploy grade-slates
```

Schedule it (SQL editor, same Vault secret as the slate job):

```sql
select cron.schedule(
  'grade-called-it-slates',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<called-it-ref>.supabase.co/functions/v1/grade-slates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The local check script also covers grading: `supabase/tests/run-local.sh`.

## Leaderboards, private leagues and profile (UNJ-1424)

New tabs: **Leaderboard**, **Leagues** and **Profile** (Today and Settings stay).
Everything is read from the points grading writes on picks (`points_earned`,
`correct`), so the scoring rules stay in `scoring_settings` and
`settle_question`. Nothing here hard-codes points.

- **Leaderboards** (`leaderboard(scope, period, today)`): Global or Friends,
  This week or All time. "This week" is Monday to Sunday, US Eastern, by slate
  date. Friends are everyone who shares a league with you. Ties share a rank.
  The top 100 show, plus your own row wherever you are.
- **Private leagues**: create one (name 3 to 30 characters), share the invite
  link (`calledit://join/<CODE>`; codes are 8 characters with no 0/O/1/I/L), and
  see a season table (`league_table`) of every member ranked by points since
  the day the league was created. Joining twice does nothing. When the owner
  leaves, the member who joined first after them becomes owner; an empty league
  is deleted. A link opened while signed out is remembered and opens after sign-in.
- **Limits**: free players can create 1 league and join any number. Pro has no
  limit. Both numbers are in the one-row `league_settings` table
  (`free_max_owned`, `free_max_joined`, null = no limit). Pro is read from
  `pro_members`, which only the service role writes; the RevenueCat webhook
  that fills it is part of the paywall work (UNJ-1417 / UNJ-1426). Until then
  everyone gets the free limit.
- **Profile** (`profile_stats()`): display name (2 to 20 characters, shown on
  boards; "Player 3F9A" until set), record, points, current and best streak,
  accuracy by sport, and badges. Badges are worked out in the app from those
  stats (`src/profile/badges.ts`), so they can change without a migration.
- **Privacy**: players still cannot read anyone else's picks. Boards, tables
  and stats come from security definer functions that return totals only.

Set up: `npx supabase db push` (migration `20261111010000_leaderboards_and_leagues.sql`).
The local check script covers it, including the issue's done check (two
accounts join by link and see each other ranked after a graded slate):
`supabase/tests/run-local.sh`.

Invite links use the app scheme, so they open the app only where it is
installed. A web link that falls back to the App Store needs a domain with
universal links / app links set up.

## Share cards and invite links (UNJ-1425)

Once every question on a slate is graded, **Share your results** on the
Results screen opens a card the player can post: record for the night,
points, best call (the correct pick that earned most, so a less popular call
wins; the crowd split is shown), streak, and a line inviting people into their
league with the link printed on it.

```
Results ─▶ Share results ─▶ Messages | Instagram Stories | X | More options
                │
                └─ link: https://<host>/join/<CODE>   (or calledit://join/<CODE> without a host)
                          │
             app installed ─▶ opens the join screen (universal links / app links)
             no app       ─▶ invite page (invite-site/) ─▶ store ─▶ sign up ─▶ join screen
```

- **Card** (`src/components/ResultsCardView.tsx`): drawn with theme tokens only,
  captured at 1080 × 1920 (Stories size) with `react-native-view-shot`. The
  numbers come from `src/share/resultsCard.ts`, which reuses the results
  summary from UNJ-1423, so points are never worked out twice.
- **Which league**: the one the player owns (the biggest, if several), else the
  biggest they are in. With several, they pick. With none, sharing first creates
  one named "<display name>'s League" (they can rename it on the share screen),
  so every shared link carries an invite.
- **Messages** attaches the card and the text with the link. **Instagram
  Stories** posts the card (the link is printed on it, since Stories can't take
  a clickable link from another app); it needs `EXPO_PUBLIC_META_APP_ID` and is
  hidden until that is set or when Instagram is not installed. **X** opens the
  composer with text and link; X does not accept an image from another app, so
  the image goes through **More options** (the system share sheet) instead.
- **New players** (no app yet): the invite page hands the code to the app after
  install. Android: the Play link carries `referrer=invite%3D<CODE>`, which the
  app reads on first launch (`expo-application`), and the join screen opens
  after sign-up. iOS has no such channel, so tapping **Get Called It** copies the
  invite link before opening the App Store; after sign-up the app shows
  "Invited by a friend?" once, with the system paste button (no permission
  prompt) and a box to type the code.

### Settings

| Where | Name | What |
| --- | --- | --- |
| app (EAS env) | `EXPO_PUBLIC_INVITE_LINK_HOST` | Host for invite links, e.g. `calledit.app`. Unset: scheme links that only work with the app installed. Also turns on `associatedDomains` (iOS) and a verified `https://<host>/join/` intent filter (Android) in `app.config.ts`. |
| app (EAS env) | `EXPO_PUBLIC_META_APP_ID` | Meta app ID, required by Instagram for Stories sharing. Unset: no Instagram button. |
| invite site build | `INVITE_LINK_HOST`, `IOS_APP_STORE_ID`, `APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS` | See below. |

### Invite page

```bash
INVITE_LINK_HOST=calledit.app IOS_APP_STORE_ID=<id> APPLE_TEAM_ID=<team> \
ANDROID_SHA256_CERT_FINGERPRINTS=<Play app signing SHA-256> \
npm run invite-site      # writes invite-site/dist
```

It refuses to build while any value is missing. `dist/` is a static site
(the join page, `.well-known/apple-app-site-association`,
`.well-known/assetlinks.json`, and rewrites for Netlify `_redirects` or
`vercel.json`) to deploy at the root of the invite host. Colors come from the
shell palette.

Check it on a device: share from one account, open the link on a phone without
the app, install, sign up, and the join screen for the sender's league opens.
