/**
 * What a level looks like, as plain data: which frame a card wears at each level, which rating lamps a player
 * gained by levelling up, and the words for the copies still to find. Kept apart from the drawing so it is tested
 * without a screen.
 */

import { LEVEL_BONUS, MAX_LEVEL, levelBonus, playerOverall } from '@/data/roster';
import type { PlayerDef } from '@/data/types';
import { RATING_KEYS, type RatingKey, type Ratings } from '@/game/sim/ratings';
import { levelProgress, type Gain } from '@/meta/collection';

/** How many of `lamps` a rating out of 100 lights. */
export function lampsFor(value: number, lamps = 10): number {
  return Math.max(0, Math.min(lamps, Math.round((value / 100) * lamps)));
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

export type FramePiece = 'trim' | 'studs' | 'chrome' | 'crest';

export interface FrameTier {
  level: number;
  /** what the level adds, in a few words, for the player page */
  name: string;
  /** a neon line inside the rim */
  trim: boolean;
  /** a lit stud in each corner */
  studs: boolean;
  /** a chrome edge round the card (gold at the top level) */
  chrome: boolean;
  /** the crest on top, and the edge turned gold */
  crest: boolean;
}

/** each level's frame, level 1 first: every level keeps what the one below has and adds one piece */
export const FRAME_TIERS: readonly FrameTier[] = [
  { level: 1, name: 'PLAIN FRAME', trim: false, studs: false, chrome: false, crest: false },
  { level: 2, name: 'NEON TRIM', trim: true, studs: false, chrome: false, crest: false },
  { level: 3, name: 'LIT STUDS', trim: true, studs: true, chrome: false, crest: false },
  { level: 4, name: 'CHROME EDGE', trim: true, studs: true, chrome: true, crest: false },
  { level: 5, name: 'GOLD CREST', trim: true, studs: true, chrome: true, crest: true },
];

/** The frame a card wears at a level. A player not found yet (level 0) wears the plain one. */
export function frameTier(level: number): FrameTier {
  const i = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level || 1))) - 1;
  return FRAME_TIERS[Math.min(i, FRAME_TIERS.length - 1)];
}

/** The pieces a frame has that the frame of `from` has not: what comes in when a player levels up. */
export function newPieces(from: number, to: number): FramePiece[] {
  const a = frameTier(from);
  const b = frameTier(to);
  return (['trim', 'studs', 'chrome', 'crest'] as const).filter((k) => b[k] && !a[k]);
}

// ---------------------------------------------------------------------------
// Rating lamps
// ---------------------------------------------------------------------------

export interface RatingLamps {
  /** the rating at this level */
  value: number;
  /** what levelling up added to it */
  bonus: number;
  /** lamps lit in all */
  lit: number;
  /** the first lamp that levelling up lit: lamps from here up to `lit` are the level's colour */
  levelFrom: number;
  /** lamps the next level would light on top, shown as dim outlines (0 at the top level) */
  next: number;
}

function capped(v: number, bonus: number): number {
  return Math.min(99, v + bonus);
}

/**
 * One rating's lamps at a level: the ones the player was found with, and the ones levelling up lit. A lamp is ten
 * points and a level is `LEVEL_BONUS`, so a level lights a new lamp only when the rating crosses one.
 */
export function ratingLamps(base: number, level: number, lamps = 10): RatingLamps {
  const at = Math.max(1, Math.min(MAX_LEVEL, level));
  const value = capped(base, levelBonus(at));
  const levelFrom = lampsFor(base, lamps);
  const lit = Math.max(levelFrom, lampsFor(value, lamps));
  const next = at >= MAX_LEVEL ? 0 : Math.max(0, lampsFor(capped(base, levelBonus(at + 1)), lamps) - lit);
  return { value, bonus: value - base, lit, levelFrom, next };
}

/** Every rating's lamps at a level, keyed like the ratings. */
export function allRatingLamps(ratings: Ratings, level: number, lamps = 10): Record<RatingKey, RatingLamps> {
  const out = {} as Record<RatingKey, RatingLamps>;
  for (const k of RATING_KEYS) out[k] = ratingLamps(ratings[k], level, lamps);
  return out;
}

/** How many new lamps going from one level to another lights across the given ratings. */
export function lampsGained(ratings: Ratings, from: number, to: number, keys: readonly RatingKey[] = RATING_KEYS, lamps = 10): number {
  let n = 0;
  for (const k of keys) n += ratingLamps(ratings[k], to, lamps).lit - ratingLamps(ratings[k], from, lamps).lit;
  return n;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export interface CopyWords {
  level: number;
  maxed: boolean;
  /** copies toward the next level, and how many it takes: the lamps of the copies bar */
  have: number;
  need: number;
  /** "2 OF 3" */
  count: string;
  /** "1 MORE COPY", or "TOP LEVEL" */
  left: string;
  /** "1 MORE COPY TO LV 4" */
  toNext: string;
  /** the same for a screen reader */
  say: string;
}

/** The copies a player still needs for the next level, in a child's words. */
export function copyWords(copies: number): CopyWords {
  const prog = levelProgress(copies);
  if (prog.maxed) return { level: prog.level, maxed: true, have: 0, need: 0, count: 'MAX', left: 'TOP LEVEL', toNext: 'TOP LEVEL!', say: `Level ${prog.level}, the top level` };
  const n = prog.need - prog.have;
  const left = `${n} MORE ${n === 1 ? 'COPY' : 'COPIES'}`;
  const next = prog.level + 1;
  return {
    level: prog.level,
    maxed: false,
    have: prog.have,
    need: prog.need,
    count: `${prog.have} OF ${prog.need}`,
    left,
    toNext: `${left} TO LV ${next}`,
    say: `Level ${prog.level}. ${n} more ${n === 1 ? 'copy' : 'copies'} to level ${next}`,
  };
}

/** where a copy's beat is: not yet, its copies lamp lit, or (a level up) the new level in */
export type Beat = 0 | 1 | 2;

/** What a copy did, the way every reward moment puts it. */
export type CopyKind = 'new' | 'levelUp' | 'copy' | 'coins';

export function copyKind(g: Gain): CopyKind {
  if (g.isNew) return 'new';
  if (g.coins > 0) return 'coins';
  if (g.levelAfter > g.levelBefore) return 'levelUp';
  return 'copy';
}

/**
 * The line under a reward's title: what a level up added, or how close one more copy brought the next level.
 * `copies` is the count once the copy is in.
 */
export function copyLine(g: Gain, copies: number): string {
  const kind = copyKind(g);
  if (kind === 'levelUp') return `Level ${g.levelBefore} → ${g.levelAfter}: +${LEVEL_BONUS * (g.levelAfter - g.levelBefore)} to every rating.`;
  if (kind === 'copy') {
    const w = copyWords(copies);
    return w.maxed ? 'Top level!' : `Copy ${w.have} of ${w.need} toward level ${w.level + 1}.`;
  }
  return '';
}

export interface NextLevel {
  level: number;
  /** what every rating gains */
  bonus: number;
  overall: number;
  /** the overall now, to count up from */
  overallNow: number;
  frame: FrameTier;
  /** the piece of frame the next level adds */
  adds: FramePiece | null;
}

/** What the next level brings a player, or null at the top level or before they are found. */
export function nextLevel(p: PlayerDef, level: number): NextLevel | null {
  if (level < 1 || level >= MAX_LEVEL) return null;
  const to = level + 1;
  return { level: to, bonus: levelBonus(to) - levelBonus(level), overall: playerOverall(p, to), overallNow: playerOverall(p, level), frame: frameTier(to), adds: newPieces(level, to)[0] ?? null };
}
