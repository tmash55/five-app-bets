/**
 * The squad's own name and colours. A name is built from two word wheels (a place or colour word, then a mascot) or
 * typed in by hand; three letters for the scoreboard come from it. Until a name is chosen the squad is "Your Squad".
 *
 * A typed name stays on the device: an online game only ever carries a wheel name, as the two words' places in these
 * lists, and the other device checks them against its own lists (see net/protocol). The lists are made up for the game,
 * kid-friendly, and kept clear of real teams' names.
 */

import { ROSTER_PACKS } from '@/data/roster';
import { pick, type Rng } from './rng';

/** the first wheel: a place or a colour */
export const PLACE_WORDS = [
  'Neon',
  'Lava',
  'Cosmic',
  'Turbo',
  'Golden',
  'Crimson',
  'Electric',
  'Frosty',
  'Shadow',
  'Jungle',
  'Galaxy',
  'Pixel',
  'Blizzard',
  'Starlight',
  'Ocean',
  'Desert',
  'Emerald',
  'Volcano',
  'Purple',
  'Silver',
  'Rainbow',
  'Bubblegum',
  'Meadow',
  'Tornado',
] as const;

/** the second wheel: a mascot */
export const MASCOT_WORDS = [
  'Turtles',
  'Ninjas',
  'Llamas',
  'Dragons',
  'Pandas',
  'Foxes',
  'Owls',
  'Narwhals',
  'Koalas',
  'Robots',
  'Monkeys',
  'Rhinos',
  'Hedgehogs',
  'Dinos',
  'Raccoons',
  'Unicorns',
  'Otters',
  'Squids',
  'Frogs',
  'Lemurs',
  'Sloths',
  'Geckos',
  'Puffins',
  'Walruses',
] as const;

/** what the squad is called before anyone names it */
export const DEFAULT_NAME = 'Your Squad';
export const DEFAULT_SHORT = 'YOU';
/** the longest typed name */
export const TYPED_MAX = 16;

/** A name off the wheels (each word one of the lists'), or one typed in. */
export type TeamName = { words: [string, string] } | { typed: string };

/** Letters, numbers and single spaces, trimmed, at most `TYPED_MAX` long: what a typed name may be. */
export function cleanTyped(text: string): string {
  return text
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^ /, '')
    .slice(0, TYPED_MAX);
}

/** A typed name worth keeping: clean already, with at least one letter or number. */
export function typedOk(text: unknown): text is string {
  return typeof text === 'string' && text.trim() === text && text.length > 0 && text.length <= TYPED_MAX && cleanTyped(text) === text;
}

export function wordsOk(words: unknown): words is [string, string] {
  return Array.isArray(words) && words.length === 2 && (PLACE_WORDS as readonly unknown[]).includes(words[0]) && (MASCOT_WORDS as readonly unknown[]).includes(words[1]);
}

/** A saved name as this build can use it, or null (the default) for anything it cannot. */
export function repairName(raw: unknown): TeamName | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { words?: unknown; typed?: unknown };
  if (wordsOk(r.words)) return { words: [r.words[0], r.words[1]] };
  if (typeof r.typed === 'string') {
    const t = cleanTyped(r.typed).trim();
    return t.length > 0 ? { typed: t } : null;
  }
  return null;
}

/** The two words' places on the wheels. */
export function wordIndexes(words: readonly [string, string]): [number, number] {
  return [(PLACE_WORDS as readonly string[]).indexOf(words[0]), (MASCOT_WORDS as readonly string[]).indexOf(words[1])];
}

/** Two places on the wheels, as they came from another device: whole numbers on the lists, or null. */
export function wordsAt(at: unknown): [string, string] | null {
  if (!Array.isArray(at) || at.length !== 2) return null;
  const [a, b] = at as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a < 0 || a >= PLACE_WORDS.length || b < 0 || b >= MASCOT_WORDS.length) return null;
  return [PLACE_WORDS[a], MASCOT_WORDS[b]];
}

export function randomWords(rng: Rng = Math.random): [string, string] {
  return [pick(rng, PLACE_WORDS), pick(rng, MASCOT_WORDS)];
}

/** The name as it is printed. */
export function nameText(name: TeamName | null): string {
  if (!name) return DEFAULT_NAME;
  return 'words' in name ? `${name.words[0]} ${name.words[1]}` : name.typed;
}

/** True for a name two wheels can make: "Lava Llamas". */
export function isWheelName(text: string): boolean {
  const parts = text.split(' ');
  return parts.length === 2 && wordsOk(parts);
}

/** three letters that must never stand for a squad on the scoreboard */
const BLOCKED_SHORTS = new Set(['ASS', 'FAT', 'POO', 'PEE', 'SEX', 'FUK', 'FUC', 'DIE', 'KKK', 'GAY', 'WTF', 'NAZ', 'HIV', 'CUM', 'TIT', 'XXX', 'SUX', 'FAG', 'DED', 'KIL', 'PIS', 'JAP', 'NIG', 'COK', 'DIK', 'VAG', 'PNS', 'DUM', 'BUM']);
/** letters taken by other things on the scoreboard */
const TAKEN_SHORTS = new Set(['YOU', 'P1', 'P2']);

function lettersOf(word: string): string {
  return word.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Letters for the scoreboard, the way a team's nickname is shortened: the mascot's first three ("Lava Llamas" is LLA).
 * A typed name of three words or more gives its initials, any other its last word's first three. Anything that spells
 * something it should not, or is taken, falls back to the next way, and in the end to "YOU".
 */
export function shortOf(name: TeamName | null): string {
  if (!name) return DEFAULT_SHORT;
  const words = ('words' in name ? [...name.words] : name.typed.split(' ')).map(lettersOf).filter((w) => w.length > 0);
  if (words.length === 0) return DEFAULT_SHORT;
  const last = words[words.length - 1];
  const all = words.join('');
  const tries = [...(words.length >= 3 ? [words.slice(0, 3).map((w) => w[0]).join('')] : []), last.slice(0, 3), all.slice(0, 3), words[0].slice(0, 3)];
  for (const t of tries) if (t.length >= 2 && !BLOCKED_SHORTS.has(t) && !TAKEN_SHORTS.has(t)) return t;
  return DEFAULT_SHORT;
}

/** True when these letters may stand for a squad. */
export function shortOk(short: string): boolean {
  return !BLOCKED_SHORTS.has(short);
}

// ---------------------------------------------------------------------------
// Team colours
// ---------------------------------------------------------------------------

/** A pair of colours for the squad's badge, its name and its side of the versus card. The jerseys stay the uniform's. */
export interface ColorScheme {
  id: string;
  name: string;
  color: string;
  color2: string;
}

/** a few made up for the squad alone, in colours the neighborhood teams do not use */
const EXTRA_SCHEMES: readonly ColorScheme[] = [
  { id: 'hot-pink', name: 'Hot Pink', color: '#FF4FA3', color2: '#2A1650' },
  { id: 'lime-zest', name: 'Lime Zest', color: '#9CFF3A', color2: '#16301A' },
  { id: 'royal-gold', name: 'Royal Gold', color: '#6A4BFF', color2: '#FFD23F' },
  { id: 'cherry-ice', name: 'Cherry Ice', color: '#E8233F', color2: '#C8F4FF' },
  { id: 'deep-sea', name: 'Deep Sea', color: '#0FB8E8', color2: '#0A2A4A' },
];

/** The schemes there are: each made-up neighborhood team's pair, then the extras. */
export const COLOR_SCHEMES: readonly ColorScheme[] = [...ROSTER_PACKS[0].teams.map((t) => ({ id: `team:${t.id}`, name: `${t.name} colors`, color: t.color, color2: t.color2 })), ...EXTRA_SCHEMES];

export function schemeById(id: string | null | undefined): ColorScheme | undefined {
  return id ? COLOR_SCHEMES.find((s) => s.id === id) : undefined;
}
