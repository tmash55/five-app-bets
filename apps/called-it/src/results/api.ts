import type { SupabaseClient } from '@supabase/supabase-js';

import type { ResultPick, ResultQuestion, ResultsSlate } from './resultsState';

export type ResultsData = {
  slate: ResultsSlate | null;
  questions: ResultQuestion[];
  picks: Record<string, ResultPick>;
  streak: number;
};

const SLATE_COLUMNS = 'id, slate_date, graded_at';

/**
 * The slate to show results for. With a date (from the results push), that
 * slate. Without one, today's slate once any of its questions has a result,
 * otherwise the latest earlier slate.
 */
async function findSlate(client: SupabaseClient, today: string, date?: string): Promise<ResultsSlate | null> {
  if (date) {
    const { data, error } = await client
      .from('slates')
      .select(SLATE_COLUMNS)
      .eq('slate_date', date)
      .eq('status', 'published')
      .maybeSingle<ResultsSlate>();
    if (error) throw error;
    return data;
  }
  const { data, error } = await client
    .from('slates')
    .select(SLATE_COLUMNS)
    .eq('status', 'published')
    .lte('slate_date', today)
    .order('slate_date', { ascending: false })
    .limit(2)
    .returns<ResultsSlate[]>();
  if (error) throw error;
  const [latest, previous] = data ?? [];
  if (!latest) return null;
  if (latest.slate_date !== today || !previous) return latest;

  const { count, error: cError } = await client
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('slate_id', latest.id)
    .eq('included', true)
    .not('result', 'is', null);
  if (cError) throw cError;
  return count ? latest : previous;
}

/** Graded questions, the player's picks with points, and the play streak. */
export async function fetchResults(client: SupabaseClient, today: string, date?: string): Promise<ResultsData> {
  const streak = client.rpc('play_streak', { p_today: today }).then(
    ({ data }) => (typeof data === 'number' ? data : 0),
    () => 0,
  );
  const slate = await findSlate(client, today, date);
  if (!slate) return { slate: null, questions: [], picks: {}, streak: await streak };

  const { data: questions, error } = await client
    .from('questions')
    .select('id, position, sport, game_label, prompt, points, result, result_value, void_reason, yes_picks, no_picks')
    .eq('slate_id', slate.id)
    .eq('included', true)
    .order('position')
    .returns<ResultQuestion[]>();
  if (error) throw error;

  const ids = (questions ?? []).map((q) => q.id);
  const picks: Record<string, ResultPick> = {};
  if (ids.length) {
    const { data: rows, error: pError } = await client
      .from('picks')
      .select('question_id, answer, correct, base_points, bonus_points')
      .in('question_id', ids)
      .returns<ResultPick[]>();
    if (pError) throw pError;
    for (const row of rows ?? []) picks[row.question_id] = row;
  }

  return {
    slate,
    questions: (questions ?? []).map((q) => ({
      ...q,
      // numeric comes back as a string from PostgREST.
      result_value: q.result_value === null ? null : Number(q.result_value),
    })),
    picks,
    streak: await streak,
  };
}
