// Supabase Edge Function: builds the draft Called It slate for one date from
// Unjuiced props and hit-rate data, and saves it for review (UNJ-1421).
//
//   POST /functions/v1/generate-slate   body: { "date": "2026-11-10" }   (date optional, defaults to today in US Eastern)
//
// Callers: the nightly cron job (service role key) or a signed-in admin from
// the review screen. Reads Unjuiced with a read-only key and never writes there.
//
// Secrets (set with `npx supabase secrets set`):
//   UNJUICED_SUPABASE_URL       https://<unjuiced-ref>.supabase.co
//   UNJUICED_SUPABASE_READ_KEY  a key that can SELECT nba_hit_rate_profiles_v2,
//                               nfl_hit_rate_profiles and nfl_games
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  easternDate,
  generateSlate,
  marketKeys,
  type NbaPropRow,
  type NflGameRow,
  type NflPropRow,
} from '../_shared/slate/index.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const PAGE = 1000;

/** Reads every page of a PostgREST query (the API caps each page). */
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

const NBA_COLUMNS = [
  'player_id', 'player_name', 'team_abbr', 'opponent_team_abbr', 'home_away', 'game_id',
  'game_date', 'game_status', 'market', 'line', 'over_price', 'under_price', 'book_count',
  'last_10_pct', 'last_10_avg', 'season_avg', 'injury_status', 'has_live_odds', 'game_logs',
].join(',');

const NFL_COLUMNS = [
  'player_id', 'player_name', 'position', 'team_abbr', 'opponent_team_abbr', 'game_id',
  'game_date', 'market', 'line', 'over_price', 'under_price', 'book_count', 'last_10_pct',
  'last_10_avg', 'sample_size_l10', 'season_avg', 'has_live_odds',
].join(',');

async function readUnjuiced(unjuiced: SupabaseClient, date: string) {
  const [nba, nfl, nflGames] = await Promise.all([
    readAll<NbaPropRow>((from, to) =>
      unjuiced
        .from('nba_hit_rate_profiles_v2')
        .select(NBA_COLUMNS)
        .eq('game_date', date)
        .eq('has_live_odds', true)
        .in('market', marketKeys('nba'))
        .order('id')
        .range(from, to)
        .returns<NbaPropRow[]>(),
    ),
    readAll<NflPropRow>((from, to) =>
      unjuiced
        .from('nfl_hit_rate_profiles')
        .select(NFL_COLUMNS)
        .eq('game_date', date)
        .eq('has_live_odds', true)
        .in('market', marketKeys('nfl'))
        .order('id')
        .range(from, to)
        .returns<NflPropRow[]>(),
    ),
    readAll<NflGameRow>((from, to) =>
      unjuiced
        .from('nfl_games')
        .select('game_id,scheduled_at,home_team_abbr,away_team_abbr,status,completed')
        .eq('game_date', date)
        .order('game_id')
        .range(from, to)
        .returns<NflGameRow[]>(),
    ),
  ]);
  return { nba, nfl, nflGames };
}

async function isAllowed(req: Request, url: string, serviceKey: string, admin: SupabaseClient) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === serviceKey) return true;

  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await userClient.auth.getUser();
  if (!data.user) return false;
  const { data: row } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  return Boolean(row);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);
  if (!(await isAllowed(req, url, serviceKey, admin))) {
    return json(403, { error: 'Only admins can generate slates.' });
  }

  const unjuicedUrl = Deno.env.get('UNJUICED_SUPABASE_URL');
  const unjuicedKey = Deno.env.get('UNJUICED_SUPABASE_READ_KEY');
  if (!unjuicedUrl || !unjuicedKey) {
    return json(500, { error: 'UNJUICED_SUPABASE_URL and UNJUICED_SUPABASE_READ_KEY are not set.' });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const date = typeof body?.date === 'string' ? body.date : easternDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'date must be YYYY-MM-DD.' });

  const unjuiced = createClient(unjuicedUrl, unjuicedKey, { auth: { persistSession: false } });
  let input;
  try {
    input = await readUnjuiced(unjuiced, date);
  } catch (error) {
    return json(502, { error: `Could not read Unjuiced data: ${(error as Error).message}` });
  }

  const slate = generateSlate({ slateDate: date, now, ...input });
  const { data, error } = await admin.rpc('replace_draft_slate', {
    p_slate_date: date,
    p_notes: slate.notes,
    p_questions: slate.questions,
  });
  if (error) return json(409, { error: error.message });

  return json(200, {
    slate_id: (data as { id: string }).id,
    slate_date: date,
    questions: slate.questions.length,
    notes: slate.notes,
    read: { nba: input.nba.length, nfl: input.nfl.length, nfl_games: input.nflGames.length },
  });
});
