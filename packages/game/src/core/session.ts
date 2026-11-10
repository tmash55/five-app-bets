import type { AnswerFeedback, GameModule, RoundConfig } from '../types';
import { elapsed, pauseClock, resumeClock, startClock, stoppedClock, type Clock } from './clock';
import {
  defaultDifficulty,
  initialDifficulty,
  recordAnswer,
  type DifficultyConfig,
  type DifficultyState,
} from './difficulty';
import { createRng } from './rng';
import {
  defaultScoring,
  scoreAnswer,
  summarizeRound,
  type AnswerRecord,
  type RoundSummary,
  type ScoringConfig,
} from './scoring';

export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'results';
export type EndReason = 'time' | 'questions';

export type SessionState<Q> = {
  phase: Phase;
  seed: number;
  countdownStartedAt: number | null;
  clock: Clock;
  difficulty: DifficultyState;
  startLevel: number;
  question: Q | null;
  /** Round-clock time (ms) when the current question appeared. */
  questionShownAt: number;
  answers: AnswerRecord[];
  score: number;
  lastFeedback: AnswerFeedback | null;
  summary: RoundSummary | null;
  endedBy: EndReason | null;
};

export type SessionAction<A> =
  | { type: 'start'; now: number; seed?: number }
  | { type: 'tick'; now: number }
  /** `questionIndex` (answers given so far) guards against a double tap answering the next question. */
  | { type: 'answer'; answer: A; now: number; questionIndex?: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' };

export type SessionOptions = {
  startLevel?: number;
  /** Seconds of "3, 2, 1" before the round. 0 skips it. */
  countdownSeconds?: number;
  seed?: number;
};

export type Session<Q, A> = {
  initialState: SessionState<Q>;
  reducer: (state: SessionState<Q>, action: SessionAction<A>) => SessionState<Q>;
  countdownMs: number;
};

export function createSession<Q, A>(game: GameModule<Q, A>, options: SessionOptions = {}): Session<Q, A> {
  validateGame(game);
  const scoring: ScoringConfig = { ...defaultScoring, ...game.scoring };
  const difficultyConfig: DifficultyConfig = { ...defaultDifficulty, ...game.difficulty };
  const countdownMs = Math.max(0, options.countdownSeconds ?? 3) * 1000;
  const startLevel = options.startLevel ?? 1;

  const initialState: SessionState<Q> = {
    phase: 'ready',
    seed: options.seed ?? 1,
    countdownStartedAt: null,
    clock: stoppedClock,
    difficulty: initialDifficulty(startLevel, game.levels),
    startLevel: initialDifficulty(startLevel, game.levels).level,
    question: null,
    questionShownAt: 0,
    answers: [],
    score: 0,
    lastFeedback: null,
    summary: null,
    endedBy: null,
  };

  function withQuestion(state: SessionState<Q>, now: number): SessionState<Q> {
    const rng = createRng(state.seed);
    const question = game.createQuestion(state.difficulty.level, rng);
    return { ...state, question, seed: rng.seed, questionShownAt: elapsed(state.clock, now) };
  }

  function beginPlaying(state: SessionState<Q>, now: number): SessionState<Q> {
    return withQuestion({ ...state, phase: 'playing', countdownStartedAt: null, clock: startClock(now) }, now);
  }

  function finish(state: SessionState<Q>, now: number, endedBy: EndReason): SessionState<Q> {
    return {
      ...state,
      phase: 'results',
      clock: pauseClock(state.clock, now),
      question: null,
      endedBy,
      summary: summarizeRound(state.answers, {
        start: state.startLevel,
        final: state.difficulty.level,
      }),
    };
  }

  function record(
    state: SessionState<Q>,
    now: number,
    result: { correct: boolean; timedOut: boolean; responseMs: number },
  ): SessionState<Q> {
    const level = state.difficulty.level;
    const targetMs = game.targetResponseMs(level);
    const score = scoreAnswer({ correct: result.correct, responseMs: result.responseMs, targetMs, level }, scoring);
    const { state: difficulty, change } = recordAnswer(
      state.difficulty,
      { correct: result.correct, responseMs: result.responseMs, targetMs },
      difficultyConfig,
    );
    const answers = [...state.answers, { ...result, level, score }];
    const next: SessionState<Q> = {
      ...state,
      answers,
      difficulty,
      score: Math.max(0, state.score + score.points),
      lastFeedback: {
        id: answers.length,
        correct: result.correct,
        timedOut: result.timedOut,
        points: score.points,
        levelChange: change,
      },
    };
    if (game.round.questions !== undefined && answers.length >= game.round.questions) {
      return finish(next, now, 'questions');
    }
    if (game.round.durationMs !== undefined && elapsed(next.clock, now) >= game.round.durationMs) {
      return finish(next, now, 'time');
    }
    return withQuestion(next, now);
  }

  function questionLimit(level: number): number | undefined {
    const limit = game.round.questionTimeLimitMs;
    return typeof limit === 'function' ? limit(level) : limit;
  }

  function reducer(state: SessionState<Q>, action: SessionAction<A>): SessionState<Q> {
    switch (action.type) {
      case 'start': {
        if (state.phase !== 'ready' && state.phase !== 'results') return state;
        const fresh: SessionState<Q> = { ...initialState, seed: action.seed ?? state.seed };
        if (countdownMs === 0) return beginPlaying(fresh, action.now);
        return { ...fresh, phase: 'countdown', countdownStartedAt: action.now };
      }
      case 'tick': {
        if (state.phase === 'countdown' && state.countdownStartedAt !== null) {
          return action.now - state.countdownStartedAt >= countdownMs ? beginPlaying(state, action.now) : state;
        }
        if (state.phase !== 'playing') return state;
        const roundElapsed = elapsed(state.clock, action.now);
        if (game.round.durationMs !== undefined && roundElapsed >= game.round.durationMs) {
          return finish(state, action.now, 'time');
        }
        const limit = questionLimit(state.difficulty.level);
        if (limit !== undefined && roundElapsed - state.questionShownAt >= limit) {
          return record(state, action.now, { correct: false, timedOut: true, responseMs: limit });
        }
        return state;
      }
      case 'answer': {
        if (state.phase !== 'playing' || state.question === null) return state;
        if (action.questionIndex !== undefined && action.questionIndex !== state.answers.length) return state;
        const responseMs = elapsed(state.clock, action.now) - state.questionShownAt;
        const correct = game.isCorrect(state.question, action.answer);
        return record(state, action.now, { correct, timedOut: false, responseMs });
      }
      case 'pause': {
        // Leaving during the countdown just goes back to the start screen.
        if (state.phase === 'countdown') return { ...state, phase: 'ready', countdownStartedAt: null };
        if (state.phase !== 'playing') return state;
        return { ...state, phase: 'paused', clock: pauseClock(state.clock, action.now) };
      }
      case 'resume': {
        if (state.phase !== 'paused') return state;
        return { ...state, phase: 'playing', clock: resumeClock(state.clock, action.now) };
      }
      case 'reset':
        return { ...initialState, seed: state.seed };
    }
  }

  return { initialState, reducer, countdownMs };
}

/** Round time left in ms, or null for rounds without a time limit. */
export function roundTimeLeft<Q>(state: SessionState<Q>, round: RoundConfig, now: number): number | null {
  if (round.durationMs === undefined) return null;
  if (state.phase === 'ready' || state.phase === 'countdown') return round.durationMs;
  return Math.max(0, round.durationMs - elapsed(state.clock, now));
}

/** Seconds left in the "3, 2, 1" countdown, rounded up. */
export function countdownLeft<Q>(state: SessionState<Q>, countdownMs: number, now: number): number {
  if (state.phase !== 'countdown' || state.countdownStartedAt === null) return 0;
  return Math.max(0, Math.ceil((countdownMs - (now - state.countdownStartedAt)) / 1000));
}

function validateGame(game: Pick<GameModule<unknown, unknown>, 'id' | 'round' | 'levels'>) {
  if (game.round.durationMs === undefined && game.round.questions === undefined) {
    throw new Error(`Game "${game.id}" must set round.durationMs, round.questions, or both.`);
  }
  if (!Number.isInteger(game.levels) || game.levels < 1) {
    throw new Error(`Game "${game.id}" must have at least one difficulty level.`);
  }
}

/** Time left on the current question in ms, or null when questions have no limit. */
export function questionTimeLeft<Q>(state: SessionState<Q>, round: RoundConfig, now: number): number | null {
  const limit = round.questionTimeLimitMs;
  if (limit === undefined || state.phase === 'ready' || state.phase === 'countdown') return null;
  const ms = typeof limit === 'function' ? limit(state.difficulty.level) : limit;
  return Math.max(0, ms - (elapsed(state.clock, now) - state.questionShownAt));
}
