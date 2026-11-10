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

Admins open the slate from the Home tab ("Review tonight's slate"), fix
anything, and tap **Approve and publish**.
