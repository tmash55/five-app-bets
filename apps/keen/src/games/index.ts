import type { GameModule } from '@five/game';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import { pairs } from './pairs';
import { quickSum } from './quickSum';

export type KeenGame = {
  module: GameModule<any, any>;
  /** The skill the game trains, shown on the game list. */
  skill: string;
};

/** Every Keen game, in the order the game list shows them. */
export const KEEN_GAMES: KeenGame[] = [
  { module: withAnswerFeedback(pairs), skill: 'Memory' },
  { module: withAnswerFeedback(quickSum), skill: 'Math' },
];

export function findGame(id: string): KeenGame | undefined {
  return KEEN_GAMES.find((game) => game.module.id === id);
}
