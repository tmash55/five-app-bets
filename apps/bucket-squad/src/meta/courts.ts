/**
 * Which court a game is played on: one picked by name, the other team's home court, or a random one. A random court
 * comes from the game's seed, so the same game always lands on the same court (and both devices of an online game
 * agree), and it is never the court just played on.
 */

import type { CourtId } from '@/game/render/court';

/** every court, in the order the pickers show them (written out so the menus' rules need nothing of the renderer) */
const EVERY: Record<CourtId, true> = { park: true, street: true, beach: true, rooftop: true, snow: true, canyon: true };
export const ALL_COURTS = Object.keys(EVERY) as CourtId[];

/** a court by name, null for the other team's (or, online, the host's) home court, or `random` */
export type CourtChoice = CourtId | null | 'random';

export const RANDOM_COURT = 'random';

export function isCourt(v: unknown): v is CourtId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EVERY, v);
}

/** A choice as saved or sent: a court this build has, null, or random. Anything else is `fallback`. */
export function courtChoiceOr(v: unknown, fallback: CourtChoice): CourtChoice {
  return v === null || v === RANDOM_COURT || isCourt(v) ? (v as CourtChoice) : fallback;
}

/** A random court from the seed, never `avoid` (the one just played) when there is another. */
export function randomCourt(seed: number, avoid?: CourtId | null): CourtId {
  const pool = avoid ? ALL_COURTS.filter((c) => c !== avoid) : ALL_COURTS;
  // the seed's low bits are spent elsewhere in a match: mix it first so neighbouring seeds spread over the courts
  let h = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return pool[((h ^ (h >>> 16)) >>> 0) % pool.length];
}

/** The court a choice comes to for a game with this seed and this home court. */
export function resolveCourt(choice: CourtChoice, home: CourtId, seed: number, avoid?: CourtId | null): CourtId {
  if (choice === RANDOM_COURT) return randomCourt(seed, avoid);
  return choice ?? home;
}
