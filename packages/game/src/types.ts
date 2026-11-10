import type { ComponentType } from 'react';

import type { DifficultyConfig } from './core/difficulty';
import type { Rng } from './core/rng';
import type { ScoringConfig } from './core/scoring';

/**
 * How a round ends. Set `durationMs`, `questions`, or both (whichever comes
 * first). `questionTimeLimitMs` gives each question its own countdown; when it
 * runs out the question counts as a miss and the next one appears.
 */
export type RoundConfig = {
  durationMs?: number;
  questions?: number;
  questionTimeLimitMs?: number | ((level: number) => number);
};

/** What the last answer did, for the board to show right/wrong feedback. */
export type AnswerFeedback = {
  /** Increases with every answer so boards can key animations on it. */
  id: number;
  correct: boolean;
  timedOut: boolean;
  points: number;
  levelChange: 'up' | 'down' | null;
};

export type BoardProps<Q, A> = {
  question: Q;
  level: number;
  /** Call once with the player's answer. Later calls for the same question are ignored. */
  onAnswer: (answer: A) => void;
  lastFeedback: AnswerFeedback | null;
};

/**
 * One game is one self-contained module of this shape. The framework owns the
 * timer, countdown, pause, scoring, difficulty and the start/pause/results
 * screens; the module only makes questions, checks answers and draws the board.
 */
export type GameModule<Q, A> = {
  id: string;
  title: string;
  /** One or two sentences shown on the start screen. */
  instructions: string;
  /** Number of difficulty levels, numbered 1..levels. */
  levels: number;
  round: RoundConfig;
  /**
   * Response time (ms) a good player hits at this level. Answers faster than
   * this earn speed points, and the player must beat it on average to move up.
   */
  targetResponseMs: (level: number) => number;
  /** Must only use `rng` for randomness so rounds replay from a seed. */
  createQuestion: (level: number, rng: Rng) => Q;
  isCorrect: (question: Q, answer: A) => boolean;
  Board: ComponentType<BoardProps<Q, A>>;
  scoring?: Partial<ScoringConfig>;
  difficulty?: Partial<DifficultyConfig>;
};
