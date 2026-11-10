import type { GameModule } from '@five/game';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import type { GameSkillId } from '@/skills/skills';
import { missingLetter } from './missingLetter';
import { oddOneOut } from './oddOneOut';
import { pairs } from './pairs';
import { priceCheck } from './priceCheck';
import { quickSum } from './quickSum';
import { sequence } from './sequence';

export type KeenGame = {
  module: GameModule<any, any>;
  /** The skill the game trains. Every game also counts toward speed. */
  skill: GameSkillId;
};

/** Every Keen game, in the order the game list shows them. */
export const KEEN_GAMES: KeenGame[] = [
  { module: withAnswerFeedback(pairs), skill: 'memory' },
  { module: withAnswerFeedback(quickSum), skill: 'math' },
  { module: withAnswerFeedback(oddOneOut), skill: 'focus' },
  { module: withAnswerFeedback(missingLetter), skill: 'words' },
  { module: withAnswerFeedback(sequence), skill: 'memory' },
  { module: withAnswerFeedback(priceCheck), skill: 'math' },
];

export function findGame(id: string): KeenGame | undefined {
  return KEEN_GAMES.find((game) => game.module.id === id);
}
