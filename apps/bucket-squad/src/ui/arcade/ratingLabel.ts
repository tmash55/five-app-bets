/** The names of the six ratings as a rating row prints them, shortened when a small row has no room for the word. */

import { RATING_LABELS, type RatingKey } from '@/game/sim/ratings';
import { track } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { widthOf } from './measure';

/** shorter names, for when a small row would cut the whole word off */
const SHORT: Record<RatingKey, string> = { speed: 'SPEED', shot: 'SHOTS', dunk: 'DUNKS', handle: 'HANDLE', steal: 'STEALS', block: 'BLOCKS' };

/** the room a small `StatRow` keeps for its name, and the size and spacing it prints it at */
const SMALL_ROOM = px(62);
const SMALL_SIZE = px(11);

/** A rating's name for its `StatRow`: the whole word unless a small row would cut it off. */
export function ratingLabel(k: RatingKey, small = false): string {
  const full = RATING_LABELS[k].toUpperCase();
  return !small || widthOf(full, 'bold', SMALL_SIZE, track.normal) <= SMALL_ROOM ? full : SHORT[k];
}
