import { defaultScoring, type GameModule, type RoundSummary } from '@five/game';

/**
 * Keen's five skills. Every game trains one of the first four; speed is
 * measured in every game from how fast the right answers come.
 */
export const SKILLS = [
  { id: 'memory', label: 'Memory' },
  { id: 'math', label: 'Math' },
  { id: 'focus', label: 'Focus' },
  { id: 'words', label: 'Words' },
  { id: 'speed', label: 'Speed' },
] as const;

export type SkillId = (typeof SKILLS)[number]['id'];
/** Skills a game can train directly (speed comes from every game). */
export type GameSkillId = Exclude<SkillId, 'speed'>;
export type SkillScores = Partial<Record<SkillId, number>>;

/** Skill scores run from 0 to this. */
export const MAX_SKILL_SCORE = 1000;
/** How far one round moves a skill score toward that round's rating. */
export const SKILL_SMOOTHING = 0.3;

export function skillLabel(id: SkillId): string {
  return SKILLS.find((skill) => skill.id === id)?.label ?? id;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Rates one round from 0 to 1000 for the game's skill and for speed.
 *
 * Skill: 70% from how high the adaptive difficulty climbed (the average of the
 * final and highest level, as a share of the game's levels) and 30% from
 * accuracy. Level carries most of the weight because the framework only moves
 * a player up when they are both right and quick enough.
 *
 * Speed: the average speed bonus share of the right answers (1 means instant,
 * 0 means at or over the level's target time), read back out of the score.
 *
 * Returns nulls for a round with no answers, which says nothing about skill.
 */
export function rateRound(
  game: Pick<GameModule<unknown, unknown>, 'levels' | 'scoring'>,
  summary: RoundSummary,
): { skill: number | null; speed: number | null } {
  if (summary.answered === 0) return { skill: null, speed: null };
  const levelShare =
    game.levels <= 1 ? 1 : clamp01(((summary.finalLevel + summary.highestLevel) / 2 - 1) / (game.levels - 1));
  const skill = Math.round(MAX_SKILL_SCORE * (0.7 * levelShare + 0.3 * clamp01(summary.accuracy)));

  const scoring = { ...defaultScoring, ...game.scoring };
  const speed =
    summary.accuracyPoints > 0 && scoring.maxSpeedBonus > 0
      ? Math.round(
          MAX_SKILL_SCORE *
            clamp01((summary.speedPoints / summary.accuracyPoints) * (scoring.correctPoints / scoring.maxSpeedBonus)),
        )
      : null;
  return { skill, speed };
}

/** Moves a score toward a new rating. The first rating sets the score. */
export function blendScore(previous: number | undefined, rating: number): number {
  if (previous === undefined) return rating;
  return Math.round(previous + SKILL_SMOOTHING * (rating - previous));
}

/** New skill scores after one round of a game that trains `skill`. */
export function applyRound(
  scores: SkillScores,
  skill: GameSkillId,
  rating: { skill: number | null; speed: number | null },
): SkillScores {
  const next = { ...scores };
  if (rating.skill !== null) next[skill] = blendScore(scores[skill], rating.skill);
  if (rating.speed !== null) next.speed = blendScore(scores.speed, rating.speed);
  return next;
}
