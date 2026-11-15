/** Naming the squad: the word wheels, typed names, the three letters, and the colours. */

import { ROSTER_PACKS } from '@/data/roster';

import { ALL_COURTS, RANDOM_COURT, courtChoiceOr, randomCourt, resolveCourt } from '../courts';
import { badgeLetters, sideColors } from '../match';
import { seededRng } from '../rng';
import { homeSide } from '../setups';
import {
  COLOR_SCHEMES,
  DEFAULT_NAME,
  MASCOT_WORDS,
  PLACE_WORDS,
  TYPED_MAX,
  cleanTyped,
  isWheelName,
  nameText,
  randomWords,
  repairName,
  schemeById,
  shortOf,
  typedOk,
  wordIndexes,
  wordsAt,
  wordsOk,
} from '../teamName';

describe('the word wheels', () => {
  it('have about two dozen words each, all different, one word apiece', () => {
    for (const list of [PLACE_WORDS, MASCOT_WORDS]) {
      expect(list.length).toBe(24);
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) expect(w).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it('never make the name of a team in the game', () => {
    const teams = new Set(ROSTER_PACKS.flatMap((p) => p.teams).flatMap((t) => [t.name, t.place]));
    for (const w of [...PLACE_WORDS, ...MASCOT_WORDS]) expect(teams.has(w)).toBe(false);
  });

  it('build a name from one word of each, and find their places again', () => {
    const name = { words: ['Lava', 'Llamas'] as [string, string] };
    expect(nameText(name)).toBe('Lava Llamas');
    expect(isWheelName('Lava Llamas')).toBe(true);
    expect(isWheelName('Llamas Lava')).toBe(false);
    expect(isWheelName('Lava')).toBe(false);
    const at = wordIndexes(name.words);
    expect(wordsAt(at)).toEqual(['Lava', 'Llamas']);
  });

  it('only take places that are on the wheels', () => {
    expect(wordsAt([0, 0])).toEqual([PLACE_WORDS[0], MASCOT_WORDS[0]]);
    expect(wordsAt([PLACE_WORDS.length - 1, MASCOT_WORDS.length - 1])).not.toBeNull();
    for (const bad of [[-1, 0], [0, MASCOT_WORDS.length], [1.5, 2], ['1', 2], [1], [1, 2, 3], null, 'Lava Llamas', { 0: 1, 1: 2 }]) expect(wordsAt(bad)).toBeNull();
  });

  it('roll a random name off the two wheels', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) expect(wordsOk(randomWords(rng))).toBe(true);
  });
});

describe('a typed name', () => {
  it('keeps letters, numbers and single spaces, up to the longest a name may be', () => {
    expect(cleanTyped('Team #1!!')).toBe('Team 1');
    expect(cleanTyped('  Big   Dogs')).toBe('Big Dogs');
    expect(cleanTyped('héllo<script>')).toBe('hlloscript');
    expect(cleanTyped('A'.repeat(40))).toHaveLength(TYPED_MAX);
    expect(typedOk('Big Dogs 2')).toBe(true);
    for (const bad of ['', ' ', ' Big', 'Big ', 'Big  Dogs', 'Big!', 'A'.repeat(TYPED_MAX + 1), 7, null]) expect(typedOk(bad)).toBe(false);
  });

  it('is repaired from a save, or dropped back to the default', () => {
    expect(repairName({ typed: '  Big!! Dogs ' })).toEqual({ typed: 'Big Dogs' });
    expect(repairName({ typed: '!!!' })).toBeNull();
    expect(repairName({ words: ['Lava', 'Llamas'] })).toEqual({ words: ['Lava', 'Llamas'] });
    expect(repairName({ words: ['Lava', 'Lizards'] })).toBeNull();
    expect(repairName(null)).toBeNull();
    expect(repairName('Lava Llamas')).toBeNull();
    expect(nameText(null)).toBe(DEFAULT_NAME);
  });
});

describe('the three letters on the scoreboard', () => {
  it('come from the mascot, from initials, or from the one word', () => {
    expect(shortOf(null)).toBe('YOU');
    expect(shortOf({ words: ['Lava', 'Llamas'] })).toBe('LLA');
    expect(shortOf({ words: ['Neon', 'Ninjas'] })).toBe('NIN');
    expect(shortOf({ typed: 'Big Red Dogs' })).toBe('BRD');
    expect(shortOf({ typed: 'Rockin' })).toBe('ROC');
    expect(shortOf({ typed: 'Team 7' })).toBe('TEA');
    expect(shortOf({ typed: 'Al' })).toBe('AL');
  });

  it('are three capital letters for every wheel name, and never spell anything rude', () => {
    for (const a of PLACE_WORDS) {
      for (const b of MASCOT_WORDS) {
        const s = shortOf({ words: [a, b] });
        expect(s).toMatch(/^[A-Z]{3}$/);
      }
    }
    expect(shortOf({ typed: 'Assorted' })).not.toBe('ASS');
    expect(shortOf({ typed: 'P1' })).toBe('YOU');
  });

  it('go on the squad’s side, with the name, and the default stays Your Squad', () => {
    const squad = [
      { id: 'wren-kowalski', level: 1 },
      { id: 'pippa-quinn', level: 1 },
      { id: 'gus-moretti', level: 1 },
    ];
    const plain = homeSide(squad);
    expect([plain.name, plain.short]).toEqual(['Your Squad', 'YOU']);
    expect(plain.colors).toBeUndefined();
    const named = homeSide(squad, null, { words: ['Cosmic', 'Otters'] }, 'hot-pink');
    expect([named.name, named.short, named.colors]).toEqual(['Cosmic Otters', 'OTT', 'hot-pink']);
    expect(badgeLetters(named)).toBe('OTT');
    expect(sideColors(named)).toMatchObject({ color: schemeById('hot-pink')!.color });
    // a colour scheme this build does not have is left off: the side shows the colours it wears
    expect(homeSide(squad, null, null, 'no-such-colors').colors).toBeUndefined();
    expect(sideColors(plain).color).toBe(ROSTER_PACKS[0].teams.find((t) => t.id === 'comets')!.color);
  });
});

describe('team colours', () => {
  it('are each made-up team’s pair and a few more, all different', () => {
    const neighborhood = ROSTER_PACKS[0].teams;
    expect(COLOR_SCHEMES.length).toBeGreaterThan(neighborhood.length);
    for (const t of neighborhood) expect(COLOR_SCHEMES.some((c) => c.color === t.color && c.color2 === t.color2)).toBe(true);
    expect(new Set(COLOR_SCHEMES.map((c) => c.id)).size).toBe(COLOR_SCHEMES.length);
    expect(new Set(COLOR_SCHEMES.map((c) => `${c.color}${c.color2}`)).size).toBe(COLOR_SCHEMES.length);
    for (const c of COLOR_SCHEMES) {
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.color2).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(schemeById(null)).toBeUndefined();
    expect(schemeById('nope')).toBeUndefined();
  });
});

describe('random courts', () => {
  it('pick among all six courts (the list is typed against the renderer’s, so it cannot miss one)', () => {
    expect(ALL_COURTS).toHaveLength(6);
    expect(new Set(ALL_COURTS).size).toBe(6);
  });

  it('come from the seed: the same seed, the same court', () => {
    for (let seed = 1; seed < 200; seed++) expect(randomCourt(seed)).toBe(randomCourt(seed));
    expect(resolveCourt(RANDOM_COURT, 'park', 1234)).toBe(randomCourt(1234));
  });

  it('land on every court, about as often, and never on the one just played', () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 6000; seed++) {
      const c = randomCourt(seed);
      seen.set(c, (seen.get(c) ?? 0) + 1);
      for (const last of ALL_COURTS) expect(randomCourt(seed, last)).not.toBe(last);
    }
    expect(seen.size).toBe(ALL_COURTS.length);
    for (const n of seen.values()) expect(n).toBeGreaterThan(700);
  });

  it('leave a picked court, or the home court, as they are', () => {
    expect(resolveCourt('beach', 'park', 99, 'beach')).toBe('beach');
    expect(resolveCourt(null, 'snow', 99, 'snow')).toBe('snow');
  });

  it('are read back from a save: a court, the home court or random, and anything else is the default', () => {
    expect(courtChoiceOr('canyon', null)).toBe('canyon');
    expect(courtChoiceOr(null, RANDOM_COURT)).toBeNull();
    expect(courtChoiceOr(RANDOM_COURT, null)).toBe(RANDOM_COURT);
    expect(courtChoiceOr('moon', RANDOM_COURT)).toBe(RANDOM_COURT);
    expect(courtChoiceOr(undefined, RANDOM_COURT)).toBe(RANDOM_COURT);
  });
});
