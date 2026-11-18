/**
 * How long each part of opening a pack takes, in milliseconds. Plain numbers in one place, so the reveals,
 * the page that plays them and the tests all agree.
 */

import type { Rarity } from '@/data/types';

export interface RevealTimes {
  /** from the card reaching the middle to the card lying face-up, settled */
  length: number;
  /** when the player's face first shows (the build-up before it never does) */
  flipAt: number;
  /** what keeps moving after the card is settled: confetti still falling, a sign still flickering */
  tail: number;
}

/**
 * Each rarity's own reveal. The better the card, the longer the build-up: a Common is over before a child
 * has time to wonder, a Legend is an event.
 */
export const REVEAL_TIMES: Record<Rarity, RevealTimes> = {
  common: { length: 900, flipAt: 330, tail: 600 },
  rare: { length: 1600, flipAt: 1100, tail: 900 },
  epic: { length: 2600, flipAt: 2230, tail: 1800 },
  legend: { length: 4200, flipAt: 3300, tail: 3600 },
};

/** with reduced motion every card simply fades from its back to its face */
export const FADE_TIMES: RevealTimes = { length: 420, flipAt: 210, tail: 0 };

/** the card rising from its place in the row to the middle */
export const ARRIVE = 420;
/** a finished card dropping back into its place in the row */
export const LEAVE = 320;
/** the card gliding aside to make room for what it says about the player */
export const GLIDE = 380;

/** the sealed pack torn open: the shaking, the strip flying off, the light, the flash and the cards dealt into the row */
export const TEAR = {
  /** shaking harder and harder until the strip tears */
  rip: 950,
  /** light pours out of the pack until the flash */
  flash: 1650,
  /** the first card leaves the pack, and each next one this much later */
  deal: 1720,
  dealGap: 110,
  /** one card's flight into the row */
  fly: 420,
} as const;

/** The whole tear, for a pack of `cards`: the last card lands in the row. */
export function tearLength(cards: number): number {
  return TEAR.deal + Math.max(0, cards - 1) * TEAR.dealGap + TEAR.fly + 80;
}

/** with reduced motion the pack fades away and the cards are simply there */
export const TEAR_FADE = 500;

/**
 * A copy's beat, once what it says is in: a pause, its copies lamp lighting, and for a level up the bar filling,
 * the frame upgrading, then the level's gold rating lamps one by one and a moment to see it.
 */
export const BEAT = { wait: 160, copy: 420, fill: 300, frame: 560, lamps: 380, lampGap: 110, hold: 360 } as const;

/** the right-hand side coming in, piece by piece, once a card is face-up */
export const INFO = {
  tag: 120,
  sign: 200,
  chip: 260,
  name: 300,
  ovr: 360,
  line: 400,
  blurb: 450,
  stats: 500,
  /** the first lamp of the first rating, and each next lamp this much later */
  lamps: 560,
  lampGap: 24,
  /** the team's lamps, each this much after the last */
  pipGap: 70,
  button: 640,
  /** one piece fading and sliding in */
  piece: 240,
} as const;
