import type { QuizAnswers } from '@five/shell';

import type { BaselineResult } from '@/baseline/baseline';
import { weakestSkill } from '@/baseline/baseline';
import { GAME_SKILLS } from '@/skills/focusSkills';
import { skillLabel, type GameSkillId, type SkillId } from '@/skills/skills';
import { WORKOUT_SIZE } from '@/workout/workout';

/**
 * The personalized plan shown after the baseline test, built from the quiz
 * answers (src/onboarding/quiz.ts) and the baseline scores.
 */
export const PLAN_EVENTS = {
  viewed: 'onboarding_plan_viewed',
  shared: 'baseline_shared',
} as const;

export type SelfRating = 'strong' | 'okay' | 'weak';

export type Plan = {
  focusSkills: GameSkillId[];
  minutesPerDay: number;
  daysPerWeek: number;
  gamesPerDay: number;
  /** The measured skill to start on: the lowest of the player's focus skills, else the lowest overall. */
  startSkill: SkillId | null;
  /** Plain sentences for the plan screen, most important first. */
  lines: string[];
};

const GOAL_SKILL: Record<string, GameSkillId> = {
  memory: 'memory',
  numbers: 'math',
  focus: 'focus',
};

const DEFAULT_MINUTES = 5;
const DEFAULT_DAYS = 5;
/** About how long one workout takes; see WORKOUT_SIZE. */
export const WORKOUT_MINUTES = 5;

function isGameSkill(value: unknown): value is GameSkillId {
  return GAME_SKILLS.includes(value as GameSkillId);
}

/**
 * Skills the player picked. With none picked, the goal's skill; with a goal
 * that names no skill, every skill.
 */
export function focusSkillsFromAnswers(answers: QuizAnswers | null): GameSkillId[] {
  const picked = answers?.focus_skills;
  const skills = Array.isArray(picked) ? picked.filter(isGameSkill) : [];
  if (skills.length > 0) return skills;
  const goal = answers?.goal;
  const fromGoal = typeof goal === 'string' ? GOAL_SKILL[goal] : undefined;
  return fromGoal ? [fromGoal] : [...GAME_SKILLS];
}

function numberAnswer(answers: QuizAnswers | null, id: string, fallback: number): number {
  const value = answers?.[id];
  return typeof value === 'number' ? value : fallback;
}

/** How a 0 to 1000 score compares with a self-rating. */
export function ratingForScore(score: number): SelfRating {
  if (score >= 600) return 'strong';
  if (score >= 350) return 'okay';
  return 'weak';
}

const RATING_ORDER: Record<SelfRating, number> = { weak: 0, okay: 1, strong: 2 };

/**
 * One sentence comparing the player's self-rating with a measured score, for
 * the skill where the two differ most. Null when every rating matched or the
 * quiz had no ratings for the measured skills.
 */
export function selfRatingInsight(answers: QuizAnswers | null, scores: BaselineResult['scores']): string | null {
  let best: { id: SkillId; gap: number; rated: SelfRating; score: number } | null = null;
  for (const [id, score] of Object.entries(scores) as [SkillId, number][]) {
    const rated = answers?.[`rate_${id}`];
    if (rated !== 'strong' && rated !== 'okay' && rated !== 'weak') continue;
    const gap = RATING_ORDER[ratingForScore(score)] - RATING_ORDER[rated];
    if (gap !== 0 && (best === null || Math.abs(gap) > Math.abs(best.gap))) best = { id, gap, rated, score };
  }
  if (!best) return null;
  const label = skillLabel(best.id).toLowerCase();
  return best.gap > 0
    ? `You undersold your ${label}: you scored ${best.score}. Nice.`
    : `Your ${label} scored ${best.score}, below what you expected. That’s the room to grow.`;
}

export function buildPlan(answers: QuizAnswers | null, baseline: BaselineResult | null): Plan {
  const focusSkills = focusSkillsFromAnswers(answers);
  const minutesPerDay = numberAnswer(answers, 'minutes', DEFAULT_MINUTES);
  const daysPerWeek = numberAnswer(answers, 'days', DEFAULT_DAYS);
  const scores = baseline?.scores ?? {};

  const focusScores = Object.fromEntries(
    Object.entries(scores).filter(([id]) => focusSkills.includes(id as GameSkillId)),
  );
  const startSkill = weakestSkill(focusScores) ?? weakestSkill(scores);

  const lines = [
    `${WORKOUT_SIZE} games a day, about ${WORKOUT_MINUTES} minutes, ${daysPerWeek} ${daysPerWeek === 1 ? 'day' : 'days'} a week.`,
    `Training ${focusSkills.map((id) => skillLabel(id).toLowerCase()).join(', ')}, plus speed in every game.`,
  ];
  if (startSkill) {
    lines.push(`We’ll start with ${skillLabel(startSkill).toLowerCase()}, your lowest score today.`);
  }
  if (minutesPerDay > WORKOUT_MINUTES) {
    lines.push(`With ${minutesPerDay} minutes, play extra rounds from the Games tab after your workout.`);
  }
  const insight = selfRatingInsight(answers, scores);
  if (insight) lines.push(insight);
  return { focusSkills, minutesPerDay, daysPerWeek, gamesPerDay: WORKOUT_SIZE, startSkill, lines };
}
