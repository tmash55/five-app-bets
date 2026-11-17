// Supabase Edge Function: grades Called It questions from final game data and
// sends "your results are in" once a slate is fully graded (UNJ-1423).
//
//   POST /functions/v1/grade-slates   (no body)
//
// Run it every 15 minutes from pg_cron with the service role key (see the
// README). Each run:
//   1. finds included questions on published slates that have started and have no result,
//   2. reads game status and player stats for those games from Unjuiced (read only),
//   3. grades each one with its stored grading rule and saves it with settle_question,
//      which scores every pick and marks the slate graded after its last question,
//   4. sends the results push for graded slates that have not had one, outside quiet hours.
// It is safe to run as often as you like: settled questions are skipped.
//
// Secrets (set with `npx supabase secrets set`):
//   UNJUICED_SUPABASE_URL       https://<unjuiced-ref>.supabase.co
//   UNJUICED_SUPABASE_READ_KEY  a key that can SELECT nba_games, nba_player_box_scores,
//                               nfl_games and nfl_player_game_logs
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// The push goes through the send-push function from the shared template (UNJ-1418).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  canSendResultsPush,
  nbaGameKey,
  nbaGames,
  nflGames,
  planGrading,
  resultsPush,
  type NbaBoxScoreRow,
  type NbaGameRow,
  type NflGameLogRow,
  type OpenQuestion,
} from '../_shared/grading/index.ts';
import type { NflGameRow } from '../_shared/slate/index.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Constant-time compare, so the key check does not leak timing. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const PAGE = 1000;

async function readAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const unique = <T,>(values: T[]) => [...new Set(values)];

/** Stat columns the open questions' rules need, plus the ones grading always reads. */
function statColumns(questions: OpenQuestion[], sport: 'nba' | 'nfl', always: string[]): string {
  const columns = questions.filter((q) => q.sport === sport).flatMap((q) => q.grading_rule?.stats ?? []);
  // Column names come from our own generator, but keep them to plain identifiers anyway.
  return unique([...always, ...columns.filter((c) => /^[a-z0-9_]+$/.test(c))]).join(',');
}

async function readUnjuiced(unjuiced: SupabaseClient, questions: OpenQuestion[]) {
  const nbaQs = questions.filter((q) => q.sport === 'nba');
  const nflQs = questions.filter((q) => q.sport === 'nfl');
  const nbaIds = unique(nbaQs.map((q) => Number(q.grading_rule?.game_id ?? q.game_id))).filter(Number.isFinite);
  const nflIds = unique(nflQs.map((q) => String(q.grading_rule?.game_id ?? q.game_id)));
  // nba_games.game_id is text and may be zero-padded, so look games up by date and match by number.
  const nbaDates = unique(
    nbaQs.flatMap((q) => {
      const start = new Date(q.starts_at);
      return [-1, 0, 1].map((d) => new Date(start.getTime() + d * 86400_000).toISOString().slice(0, 10));
    }),
  );

  const [nbaGameRows, nbaBox, nflGameRows, nflLogs] = await Promise.all([
    nbaIds.length
      ? readAll<NbaGameRow>((from, to) =>
          unjuiced
            .from('nba_games')
            .select('game_id,game_date,game_status,game_status_text')
            .in('game_date', nbaDates)
            .order('game_id')
            .range(from, to)
            .returns<NbaGameRow[]>(),
        )
      : Promise.resolve([]),
    nbaIds.length
      ? readAll<NbaBoxScoreRow>((from, to) =>
          unjuiced
            .from('nba_player_box_scores')
            .select(statColumns(questions, 'nba', ['game_id', 'player_id', 'minutes']))
            .in('game_id', nbaIds)
            .order('id')
            .range(from, to)
            .returns<NbaBoxScoreRow[]>(),
        )
      : Promise.resolve([]),
    nflIds.length
      ? readAll<NflGameRow>((from, to) =>
          unjuiced
            .from('nfl_games')
            .select('game_id,scheduled_at,home_team_abbr,away_team_abbr,status,completed')
            .in('game_id', nflIds)
            .order('game_id')
            .range(from, to)
            .returns<NflGameRow[]>(),
        )
      : Promise.resolve([]),
    nflIds.length
      ? readAll<NflGameLogRow>((from, to) =>
          unjuiced
            .from('nfl_player_game_logs')
            .select(statColumns(questions, 'nfl', ['game_id', 'player_id', 'played']))
            .in('game_id', nflIds)
            .order('game_id')
            .order('player_id')
            .range(from, to)
            .returns<NflGameLogRow[]>(),
        )
      : Promise.resolve([]),
  ]);

  const wanted = new Set(nbaIds.map((id) => nbaGameKey(id)));
  return {
    nba: nbaGames(nbaGameRows.filter((g) => wanted.has(nbaGameKey(g.game_id))), nbaBox),
    nfl: nflGames(nflGameRows, nflLogs),
  };
}

/** Sends the results push for each fully graded slate that has not had one. */
async function notifyGradedSlates(admin: SupabaseClient, url: string, serviceKey: string, now: Date) {
  if (!canSendResultsPush(now)) return { held: 'quiet hours' as const, sent: [] as string[], errors: [] as string[] };

  const { data: slates, error } = await admin
    .from('slates')
    .select('id, slate_date')
    .not('graded_at', 'is', null)
    .is('results_notified_at', null)
    .eq('status', 'published');
  if (error) return { sent: [], errors: [error.message] };

  const sent: string[] = [];
  const errors: string[] = [];
  for (const slate of slates ?? []) {
    const { data: rows, error: pError } = await admin
      .from('picks')
      .select('user_id, questions!inner(slate_id)')
      .eq('questions.slate_id', slate.id);
    if (pError) {
      errors.push(pError.message);
      continue;
    }
    const userIds = unique((rows ?? []).map((r: { user_id: string }) => r.user_id));
    if (userIds.length) {
      const response = await fetch(`${url}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds, ...resultsPush(slate.slate_date) }),
      });
      if (!response.ok) {
        // Leave results_notified_at empty so the next run tries again.
        errors.push(`send-push returned ${response.status} for ${slate.slate_date}: ${await response.text()}`);
        continue;
      }
    }
    await admin.from('slates').update({ results_notified_at: now.toISOString() }).eq('id', slate.id);
    sent.push(slate.slate_date);
  }
  return { sent, errors };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!bearer || !safeEqual(bearer, serviceKey)) return json(401, { error: 'Service role key required.' });

  const unjuicedUrl = Deno.env.get('UNJUICED_SUPABASE_URL');
  const unjuicedKey = Deno.env.get('UNJUICED_SUPABASE_READ_KEY');
  if (!unjuicedUrl || !unjuicedKey) {
    return json(500, { error: 'UNJUICED_SUPABASE_URL and UNJUICED_SUPABASE_READ_KEY are not set.' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const now = new Date();

  const { data: open, error } = await admin
    .from('questions')
    .select('id, slate_id, sport, game_id, starts_at, grading_rule, slates!inner(status)')
    .is('result', null)
    .eq('included', true)
    .lte('lock_at', now.toISOString())
    .eq('slates.status', 'published')
    .order('starts_at')
    .limit(500)
    .returns<OpenQuestion[]>();
  if (error) return json(500, { error: error.message });

  const questions = open ?? [];
  let plan = { settle: [], pending: [], errors: [] } as ReturnType<typeof planGrading>;
  if (questions.length) {
    const unjuiced = createClient(unjuicedUrl, unjuicedKey, { auth: { persistSession: false } });
    let games;
    try {
      games = await readUnjuiced(unjuiced, questions);
    } catch (e) {
      return json(502, { error: `Could not read Unjuiced data: ${(e as Error).message}` });
    }
    plan = planGrading(questions, games, now);
  }

  const saveErrors: string[] = [];
  const slatesDone: string[] = [];
  for (const s of plan.settle) {
    const { data, error: sError } = await admin.rpc('settle_question', {
      p_question_id: s.question_id,
      p_result: s.result,
      p_value: s.value,
      p_void_reason: s.void_reason,
    });
    if (sError) saveErrors.push(`${s.question_id}: ${sError.message}`);
    else if (data === true) slatesDone.push(s.question_id);
  }

  const push = await notifyGradedSlates(admin, url, serviceKey, now);

  return json(200, {
    open: questions.length,
    settled: plan.settle.map((s) => ({ id: s.question_id, result: s.result, value: s.value, void_reason: s.void_reason })),
    pending: plan.pending,
    // Rules this code cannot grade. These need a person (settle_question in the SQL editor).
    errors: [...plan.errors.map((e) => `${e.id}: ${e.why}`), ...saveErrors],
    slates_completed: slatesDone.length,
    push,
  });
});
