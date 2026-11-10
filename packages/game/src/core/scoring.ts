/**
 * Points for one answer have two parts:
 *  - accuracy: a flat amount for a correct answer,
 *  - speed: a bonus that shrinks linearly from the full amount at 0 ms to
 *    nothing at the level's target response time.
 * Both scale with the difficulty level, so playing harder pays more.
 * Wrong or timed-out answers score nothing (or lose `wrongPenalty`).
 */
export type ScoringConfig = {
  correctPoints: number;
  maxSpeedBonus: number;
  /** Extra multiplier per level above 1. 0.25 means level 3 pays 1.5x. */
  levelMultiplierStep: number;
  /** Points taken away for a wrong answer. Total score never goes below 0. */
  wrongPenalty: number;
};

export const defaultScoring: ScoringConfig = {
  correctPoints: 100,
  maxSpeedBonus: 50,
  levelMultiplierStep: 0.25,
  wrongPenalty: 0,
};

export type AnswerScore = {
  accuracyPoints: number;
  speedPoints: number;
  /** Signed change to the total. Negative only when a penalty applies. */
  points: number;
};

export function levelMultiplier(level: number, config: ScoringConfig = defaultScoring): number {
  return 1 + Math.max(0, level - 1) * config.levelMultiplierStep;
}

export function scoreAnswer(
  input: { correct: boolean; responseMs: number; targetMs: number; level: number },
  config: ScoringConfig = defaultScoring,
): AnswerScore {
  if (!input.correct) {
    return { accuracyPoints: 0, speedPoints: 0, points: config.wrongPenalty === 0 ? 0 : -config.wrongPenalty };
  }
  const multiplier = levelMultiplier(input.level, config);
  const speedShare =
    input.targetMs > 0 ? Math.min(1, Math.max(0, 1 - input.responseMs / input.targetMs)) : 0;
  const accuracyPoints = Math.round(config.correctPoints * multiplier);
  const speedPoints = Math.round(config.maxSpeedBonus * speedShare * multiplier);
  return { accuracyPoints, speedPoints, points: accuracyPoints + speedPoints };
}

export type AnswerRecord = {
  correct: boolean;
  /** True when the per-question time limit ran out before an answer. */
  timedOut: boolean;
  responseMs: number;
  level: number;
  score: AnswerScore;
};

export type RoundSummary = {
  score: number;
  accuracyPoints: number;
  speedPoints: number;
  answered: number;
  correct: number;
  /** 0 to 1. 0 when nothing was answered. */
  accuracy: number;
  /** Mean response time of correct answers, or null if none. */
  averageCorrectMs: number | null;
  startLevel: number;
  finalLevel: number;
  highestLevel: number;
  longestStreak: number;
};

export function summarizeRound(
  answers: readonly AnswerRecord[],
  levels: { start: number; final: number },
): RoundSummary {
  let score = 0;
  let accuracyPoints = 0;
  let speedPoints = 0;
  let correct = 0;
  let correctMs = 0;
  let highestLevel = levels.start;
  let streak = 0;
  let longestStreak = 0;
  for (const answer of answers) {
    score = Math.max(0, score + answer.score.points);
    accuracyPoints += answer.score.accuracyPoints;
    speedPoints += answer.score.speedPoints;
    highestLevel = Math.max(highestLevel, answer.level);
    if (answer.correct) {
      correct += 1;
      correctMs += answer.responseMs;
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }
  return {
    score,
    accuracyPoints,
    speedPoints,
    answered: answers.length,
    correct,
    accuracy: answers.length === 0 ? 0 : correct / answers.length,
    averageCorrectMs: correct === 0 ? null : Math.round(correctMs / correct),
    startLevel: levels.start,
    finalLevel: levels.final,
    highestLevel: Math.max(highestLevel, levels.final),
    longestStreak,
  };
}
