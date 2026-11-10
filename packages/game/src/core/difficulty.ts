/**
 * Adaptive difficulty as a staircase. After every `windowSize` answers at the
 * current level the player moves:
 *  - up one level when accuracy is at least `promoteAccuracy` and the average
 *    correct answer came in under the level's target time,
 *  - down one level when accuracy is below `demoteAccuracy`.
 * Missing `missesToDrop` answers in a row drops a level straight away, so a
 * struggling player is not stuck until the window fills.
 */
export type DifficultyConfig = {
  windowSize: number;
  promoteAccuracy: number;
  demoteAccuracy: number;
  missesToDrop: number;
};

export const defaultDifficulty: DifficultyConfig = {
  windowSize: 4,
  promoteAccuracy: 0.75,
  demoteAccuracy: 0.5,
  missesToDrop: 2,
};

export type DifficultyState = {
  level: number;
  minLevel: number;
  maxLevel: number;
  /** Answers given at the current level since the last change. */
  window: { correct: boolean; responseMs: number }[];
  consecutiveMisses: number;
};

export function initialDifficulty(level: number, maxLevel: number, minLevel = 1): DifficultyState {
  if (maxLevel < minLevel) throw new Error(`maxLevel ${maxLevel} is below minLevel ${minLevel}`);
  return {
    level: clamp(level, minLevel, maxLevel),
    minLevel,
    maxLevel,
    window: [],
    consecutiveMisses: 0,
  };
}

export type DifficultyChange = 'up' | 'down' | null;

export function recordAnswer(
  state: DifficultyState,
  answer: { correct: boolean; responseMs: number; targetMs: number },
  config: DifficultyConfig = defaultDifficulty,
): { state: DifficultyState; change: DifficultyChange } {
  const consecutiveMisses = answer.correct ? 0 : state.consecutiveMisses + 1;
  const window = [...state.window, { correct: answer.correct, responseMs: answer.responseMs }];

  if (consecutiveMisses >= config.missesToDrop && state.level > state.minLevel) {
    return { state: moveTo(state, state.level - 1), change: 'down' };
  }

  if (window.length < config.windowSize) {
    return { state: { ...state, window, consecutiveMisses }, change: null };
  }

  const correct = window.filter((entry) => entry.correct);
  const accuracy = correct.length / window.length;
  const averageCorrectMs =
    correct.length === 0
      ? Infinity
      : correct.reduce((sum, entry) => sum + entry.responseMs, 0) / correct.length;

  if (
    accuracy >= config.promoteAccuracy &&
    averageCorrectMs <= answer.targetMs &&
    state.level < state.maxLevel
  ) {
    return { state: moveTo(state, state.level + 1), change: 'up' };
  }
  if (accuracy < config.demoteAccuracy && state.level > state.minLevel) {
    return { state: moveTo(state, state.level - 1), change: 'down' };
  }
  // Window full but no move: start a fresh window at the same level.
  return { state: { ...state, window: [], consecutiveMisses }, change: null };
}

function moveTo(state: DifficultyState, level: number): DifficultyState {
  return { ...state, level: clamp(level, state.minLevel, state.maxLevel), window: [], consecutiveMisses: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
