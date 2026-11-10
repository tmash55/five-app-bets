import type { SupabaseClient } from '@supabase/supabase-js';

import type { ReviewQuestion, ReviewSlate } from './reviewState';

export async function fetchIsAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

/** The slate for a date, with every question (admins see drafts and stat lines). */
export async function fetchSlate(
  client: SupabaseClient,
  slateDate: string,
): Promise<{ slate: ReviewSlate; questions: ReviewQuestion[] } | null> {
  const { data: slate, error } = await client
    .from('slates')
    .select('id, slate_date, status, generated_at, generator_notes')
    .eq('slate_date', slateDate)
    .maybeSingle<ReviewSlate>();
  if (error) throw error;
  if (!slate) return null;

  const { data: rows, error: qError } = await client
    .from('questions')
    .select(
      'id, position, sport, game_label, lock_at, prompt, generated_prompt, included, grading_rule, question_stat_lines(stat_line)',
    )
    .eq('slate_id', slate.id)
    .order('position');
  if (qError) throw qError;

  type Row = Omit<ReviewQuestion, 'stat_line'> & {
    question_stat_lines: { stat_line: string } | { stat_line: string }[] | null;
  };
  const questions = ((rows ?? []) as Row[]).map(({ question_stat_lines: s, ...q }) => ({
    ...q,
    stat_line: (Array.isArray(s) ? s[0]?.stat_line : s?.stat_line) ?? null,
  }));
  return { slate, questions };
}

export async function saveEdits(
  client: SupabaseClient,
  edits: Record<string, { prompt?: string; included?: boolean }>,
): Promise<void> {
  for (const [id, change] of Object.entries(edits)) {
    const patch = { ...change, ...(change.prompt ? { prompt: change.prompt.trim() } : {}) };
    const { error } = await client.from('questions').update(patch).eq('id', id);
    if (error) throw error;
  }
}

export async function regenerateSlate(client: SupabaseClient, slateDate: string): Promise<void> {
  const { error } = await client.functions.invoke('generate-slate', { body: { date: slateDate } });
  if (error) {
    // FunctionsHttpError keeps the response; surface the function's own message.
    const context = (error as { context?: Response }).context;
    const body = context ? await context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
}

export async function publishSlate(client: SupabaseClient, slateId: string): Promise<void> {
  const { error } = await client.rpc('publish_slate', { p_slate_id: slateId });
  if (error) throw error;
}
