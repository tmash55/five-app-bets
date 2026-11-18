import { clamp01 } from './math';
import type { Attrs } from './types';

/** The six numbers printed on a player card, each 1-99. */
export interface Ratings {
  speed: number;
  shot: number;
  dunk: number;
  handle: number;
  steal: number;
  block: number;
}

export const RATING_KEYS = ['speed', 'shot', 'dunk', 'handle', 'steal', 'block'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const RATING_LABELS: Record<RatingKey, string> = {
  speed: 'Speed',
  shot: 'Shooting',
  dunk: 'Dunking',
  handle: 'Handles',
  steal: 'Steals',
  block: 'Blocks',
};

const FLOOR = 40;
const CEIL = 99;

/** Card rating (1-99) to the 0..1 value the simulation uses. */
export function ratingToAttr(r: number): number {
  return clamp01((r - FLOOR) / (CEIL - FLOOR));
}

export function toAttrs(r: Ratings, bonus = 0): Attrs {
  return {
    speed: ratingToAttr(r.speed + bonus),
    shot: ratingToAttr(r.shot + bonus),
    dunk: ratingToAttr(r.dunk + bonus),
    handle: ratingToAttr(r.handle + bonus),
    steal: ratingToAttr(r.steal + bonus),
    block: ratingToAttr(r.block + bonus),
  };
}

/** The big number on the card. Offense counts a little more than defense. */
export function overall(r: Ratings): number {
  const v = r.speed * 0.2 + r.shot * 0.22 + r.dunk * 0.2 + r.handle * 0.16 + r.steal * 0.11 + r.block * 0.11;
  return Math.round(v);
}
