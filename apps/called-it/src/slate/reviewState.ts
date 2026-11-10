import { SLATE_MAX, SLATE_MIN } from '../../supabase/functions/_shared/slate/generate.ts';
import type { GradingRule, Sport } from '../../supabase/functions/_shared/slate/types.ts';

/** A question as the review screen loads it from the Called It database. */
export type ReviewQuestion = {
  id: string;
  position: number;
  sport: Sport;
  game_label: string;
  lock_at: string;
  prompt: string;
  generated_prompt: string;
  included: boolean;
  grading_rule: GradingRule;
  stat_line: string | null;
};

export type ReviewSlate = {
  id: string;
  slate_date: string;
  status: 'draft' | 'published';
  generated_at: string;
  generator_notes: string[];
};

/** Edits not yet saved, keyed by question id. */
export type Draft = Record<string, { prompt?: string; included?: boolean }>;

export function current(q: ReviewQuestion, draft: Draft): ReviewQuestion {
  return { ...q, ...draft[q.id] };
}

/** Records an edit, dropping it again when it matches what is saved. */
export function edit(
  draft: Draft,
  q: ReviewQuestion,
  change: { prompt?: string; included?: boolean },
): Draft {
  const next = { ...draft[q.id], ...change };
  if (next.prompt === q.prompt) delete next.prompt;
  if (next.included === q.included) delete next.included;
  const out = { ...draft };
  if (Object.keys(next).length === 0) delete out[q.id];
  else out[q.id] = next;
  return out;
}

export const PROMPT_MIN = 10;
export const PROMPT_MAX = 200;

export function promptError(prompt: string): string | undefined {
  const length = prompt.trim().length;
  if (length < PROMPT_MIN) return `Write at least ${PROMPT_MIN} characters.`;
  if (length > PROMPT_MAX) return `Keep it under ${PROMPT_MAX} characters.`;
  if (!prompt.trim().endsWith('?')) return 'End with a question mark.';
  return undefined;
}

/** Plain summary of the grading rule, so a reworded prompt keeps its meaning. */
export function ruleSummary(rule: GradingRule): string {
  const stats = rule.stats.join(' + ');
  return `${rule.player_name}: ${stats} ≥ ${rule.threshold} (line ${rule.line}). Void if inactive.`;
}

/** Reasons the slate cannot be published yet; empty when it can. */
export function publishBlockers(questions: ReviewQuestion[], draft: Draft, now: Date): string[] {
  const live = questions.map((q) => current(q, draft)).filter((q) => q.included);
  const out: string[] = [];
  if (Object.keys(draft).length > 0) out.push('Save your edits first.');
  if (live.length < SLATE_MIN || live.length > SLATE_MAX) {
    out.push(`Keep ${SLATE_MIN} to ${SLATE_MAX} questions (now ${live.length}).`);
  }
  const locked = live.filter((q) => Date.parse(q.lock_at) <= now.getTime()).length;
  if (locked > 0) out.push(`${locked} included ${locked === 1 ? 'question has' : 'questions have'} already locked.`);
  if (live.some((q) => promptError(q.prompt))) out.push('Fix the questions marked in red.');
  return out;
}
