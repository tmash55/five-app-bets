import type { SupabaseClient } from '@supabase/supabase-js';

import type { Picks, TodayQuestion, TodaySlate } from './todayState';

/** The SQLSTATE `make_pick` raises when the question has locked (see the picks migration). */
export const PICK_LOCKED_CODE = 'CI423';

export class PickLockedError extends Error {
  constructor(message = 'This game has started, so the pick is locked.') {
    super(message);
    this.name = 'PickLockedError';
  }
}

export type TodayData = {
  slate: TodaySlate | null;
  questions: TodayQuestion[];
  picks: Picks;
  /** Database clock minus the phone's clock, in ms, so the countdown matches the enforced lock. */
  clockOffsetMs: number;
};

async function fetchClockOffset(client: SupabaseClient): Promise<number> {
  const sent = Date.now();
  const { data, error } = await client.rpc('server_now');
  const received = Date.now();
  if (error || typeof data !== 'string') return 0;
  return Date.parse(data) - (sent + received) / 2;
}

/** The published slate for a date with the player's own picks. Drafts are invisible to players. */
export async function fetchToday(client: SupabaseClient, slateDate: string): Promise<TodayData> {
  const offset = fetchClockOffset(client).catch(() => 0);
  const { data: slate, error } = await client
    .from('slates')
    .select('id, slate_date')
    .eq('slate_date', slateDate)
    .eq('status', 'published')
    .maybeSingle<TodaySlate>();
  if (error) throw error;
  if (!slate) return { slate: null, questions: [], picks: {}, clockOffsetMs: await offset };

  const { data: questions, error: qError } = await client
    .from('questions')
    .select('id, position, sport, game_label, starts_at, lock_at, prompt, points')
    .eq('slate_id', slate.id)
    .eq('included', true)
    .order('position')
    .returns<TodayQuestion[]>();
  if (qError) throw qError;

  const ids = (questions ?? []).map((q) => q.id);
  const picks: Picks = {};
  if (ids.length) {
    const { data: rows, error: pError } = await client
      .from('picks')
      .select('question_id, answer')
      .in('question_id', ids)
      .returns<{ question_id: string; answer: boolean }[]>();
    if (pError) throw pError;
    for (const row of rows ?? []) picks[row.question_id] = row.answer;
  }

  return { slate, questions: questions ?? [], picks, clockOffsetMs: await offset };
}

/** Saves or changes a pick. The database refuses once the question has locked. */
export async function makePick(client: SupabaseClient, questionId: string, answer: boolean): Promise<void> {
  const { error } = await client.rpc('make_pick', { p_question_id: questionId, p_answer: answer });
  if (!error) return;
  if (error.code === PICK_LOCKED_CODE) throw new PickLockedError(error.message);
  throw new Error(error.message);
}
