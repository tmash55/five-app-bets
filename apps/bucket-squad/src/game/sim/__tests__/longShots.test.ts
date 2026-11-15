/**
 * Long shots by level. Rookie keeps the odds as they were and only stops long misses rattling in as often; Pro and
 * All-Star make shots from past a shooter's range fall off faster and a shot from the far half all but impossible,
 * for both teams, whatever helps the shooter.
 */

import { TIERS } from '@/meta/ladder';
import { buildMatch, type SidePlayer } from '@/meta/match';
import { seededRng } from '@/meta/rng';
import { duoSetup, ladderSetup, onlineSetup, quickSetup, type Prefs } from '@/meta/setups';
import { shootAround, type LabResult } from '@/testing/shotLab';
import { COURT, DEEP_LEVELS, FIRE, HYPE } from '../constants';
import { attackSign, distToHoop, hoopXOf, isHeave, isThree, luckShare, makeProb, shootingRange, shotLevelFor, shotLevelOf } from '../core';
import { rangeBoost, shotBoost } from '../fire';
import { clamp, clamp01 } from '../math';
import { bandOf } from '../seats';
import { createMatch } from '../sim';
import type { Attrs, MatchConfig, MatchState, PlayerSim, ShotGrade } from '../types';

const LEVELS = [0, 1, 2] as const;
const GRADES: ShotGrade[] = ['perfect', 'good', 'ok', 'bad'];
/** a shot from the far half has at most this chance as it leaves the hand, per level (Rookie: as it always did, 2 or 3 in a hundred) */
const FAR_MOST = [0.03, 0.005, 0.001];

function attrs(shot: number): Attrs {
  return { speed: 0.6, shot, dunk: 0.5, handle: 0.6, steal: 0.5, block: 0.5 };
}

function match(level: 0 | 1 | 2, rubberBand = 0): MatchState {
  const team = () => ({ players: [{ id: 'a', attrs: attrs(0.5) }, { id: 'b', attrs: attrs(0.5) }] });
  const cfg: MatchConfig = { seed: 1, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand, autoSwitch: true, shotLevel: level };
  return createMatch(cfg);
}

/** a shooter of `team`, `d` from the hoop and `angle` round from straight out, with the given shooting */
function shooter(m: MatchState, shot: number, d: number, angle = 0, team: 0 | 1 = 0): PlayerSim {
  const p = m.players.find((q) => q.team === team)!;
  p.attrs = attrs(shot);
  p.x = hoopXOf(team) - attackSign(team) * Math.cos(angle) * d;
  p.z = Math.sin(angle) * d;
  return p;
}

/** Everything that can help a shot: Hype, fire, the most rubber band, and twelve behind. */
function helped(level: 0 | 1 | 2, team: 0 | 1): MatchState {
  const m = match(level, 1);
  m.score = team === 0 ? [0, 12] : [12, 0];
  m.hypeT = team === 0 ? [5, 0] : [0, 5];
  for (const p of m.players) if (p.team === team) p.fireT = 5;
  return m;
}

/**
 * The chance of a shot as it was before the levels (commit d05d461), written out once more so Rookie can be held to
 * it number for number.
 */
function todaysOdds(m: MatchState, p: PlayerSim, contest: number, grade: ShotGrade, moving: number): number {
  const d = distToHoop(p);
  const s = p.attrs.shot;
  const three = isThree(p.x, p.z, p.team);
  const extra = rangeBoost(p);
  const past = three ? Math.max(0, d - (COURT.threeR + 0.3 + 1.5 * s + extra)) : 0;
  const timing = clamp01(1 - past / 2);
  let base: number;
  if (d < 2.3) base = 0.62 + 0.2 * (0.5 * s + 0.5 * p.attrs.dunk);
  else if (!three) base = 0.41 + 0.26 * s - 0.012 * (d - 2.3);
  else base = 0.1 + 0.34 * s - past * (0.16 + 0.08 * (1 - s));
  let c = contest;
  if (grade === 'perfect') {
    base += (three ? 0.06 + 0.18 * s : 0.24) * timing;
    c *= 0.55;
  } else if (grade === 'good') base += 0.07 * timing;
  else if (grade === 'ok') base -= 0.04;
  else base -= 0.22;
  base -= c * 0.4;
  base += shotBoost(m, p);
  const diff = clamp(m.score[p.team] - m.score[1 - p.team], -12, 12) / 12;
  base -= diff * 0.07 * bandOf(m, p.team, diff);
  base -= Math.min(0.07, moving * 0.011);
  const chance = clamp(base, 0.02, 0.96);
  const heave = d >= COURT.hoopX || d > COURT.threeR + 0.3 + 1.5 * s + extra + 2.5;
  return three && heave ? Math.min(chance, 0.01 + 0.02 * s) : chance;
}

describe('the odds of a long shot', () => {
  const SHOOTERS = [0, 0.2, 0.5, 0.75, 0.9, 1];
  const DISTANCES: number[] = [];
  for (let d = 1; d < 23; d += 0.35) DISTANCES.push(d);
  const SITUATIONS: [string, (level: 0 | 1 | 2) => MatchState][] = [
    ['plain', (l) => match(l)],
    ['helped', (l) => helped(l, 0)],
    ['ahead with the band on', (l) => {
      const m = match(l, 1);
      m.score = [12, 0];
      return m;
    }],
  ];

  it('are on Rookie exactly what they were, from everywhere, for every shooter, release and situation', () => {
    let checked = 0;
    for (const [, make] of SITUATIONS) {
      const m = make(0);
      for (const shot of SHOOTERS) {
        for (const d of DISTANCES) {
          for (const angle of [0, 0.6, 1.2]) {
            const p = shooter(m, shot, d, angle);
            if (Math.abs(p.z) > COURT.halfW) continue;
            for (const grade of GRADES) {
              for (const [contest, moving] of [[0, 0], [0.5, 3], [1, 8]]) {
                expect(makeProb(m, p, contest, grade, moving)).toBe(todaysOdds(m, p, contest, grade, moving));
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('are the same on every level inside a shooter’s range', () => {
    for (const [, make] of SITUATIONS) {
      for (const shot of SHOOTERS) {
        for (const d of DISTANCES) {
          if (d > shootingRange(shot)) continue;
          for (const grade of GRADES) {
            const rookie = makeProb(make(0), shooter(make(0), shot, d), 0, grade, 0);
            for (const level of [1, 2] as const) {
              const m = make(level);
              expect(makeProb(m, shooter(m, shot, d), 0, grade, 0)).toBe(rookie);
            }
          }
        }
      }
    }
  });

  it('never get easier further from the hoop, on any level, for any shooter, release or situation', () => {
    for (const level of LEVELS) {
      for (const [, make] of SITUATIONS) {
        const m = make(level);
        for (const shot of SHOOTERS) {
          for (const grade of GRADES) {
            let last = 1;
            for (let d = COURT.threeR + 0.05; d < 23; d += 0.1) {
              const p = makeProb(m, shooter(m, shot, d), 0, grade, 0);
              expect(p).toBeLessThanOrEqual(last + 1e-12);
              last = p;
            }
          }
        }
      }
    }
  });

  it('are never better past range on a harder level, and clearly worse a step past it', () => {
    for (const [, make] of SITUATIONS) {
      for (const shot of SHOOTERS) {
        for (const grade of GRADES) {
          for (let past = 0.05; past < 16; past += 0.15) {
            const d = shootingRange(shot) + past;
            const odds = LEVELS.map((l) => {
              const m = make(l);
              return makeProb(m, shooter(m, shot, d), 0, grade, 0);
            });
            expect(odds[1]).toBeLessThanOrEqual(odds[0]);
            expect(odds[2]).toBeLessThanOrEqual(odds[1]);
          }
        }
      }
    }
    // an average shooter, open, a step past their range with a perfect release
    const d = shootingRange(0.5) + 1;
    const [rookie, pro, allStar] = LEVELS.map((l) => makeProb(match(l), shooter(match(l), 0.5, d), 0, 'perfect', 0));
    expect(rookie).toBeGreaterThan(0.12);
    expect(pro).toBeLessThan(rookie * 0.6);
    expect(allStar).toBeLessThan(pro * 0.5);
  });

  it('let a perfect release help less past range on the harder levels', () => {
    for (const shot of [0.3, 0.6, 0.9]) {
      const d = shootingRange(shot) + 1;
      const lift = LEVELS.map((l) => {
        const m = match(l);
        return makeProb(m, shooter(m, shot, d), 0, 'perfect', 0) - makeProb(m, shooter(m, shot, d), 0, 'ok', 0);
      });
      expect(lift[0]).toBeGreaterThan(0);
      expect(lift[1]).toBeLessThan(lift[0]);
      expect(lift[2]).toBeLessThanOrEqual(lift[1]);
      if (shot > 0.5) expect(lift[2]).toBeLessThan(lift[1]);
    }
  });

  it('keep a shot from the far half under the level’s cap, for both teams, whatever helps it', () => {
    for (const level of LEVELS) {
      for (const team of [0, 1] as const) {
        for (const make of [() => match(level), () => helped(level, team)]) {
          const m = make();
          for (const shot of SHOOTERS) {
            for (let d = COURT.hoopX; d < 23; d += 0.25) {
              for (const angle of [0, 0.3, -0.45]) {
                const p = shooter(m, shot, d, angle, team);
                if (Math.abs(p.z) > COURT.halfW) continue;
                for (const grade of GRADES) expect(makeProb(m, p, 0, grade, 0)).toBeLessThanOrEqual(FAR_MOST[level] + 1e-12);
              }
            }
          }
        }
      }
    }
    // with everything helping, the best shooter on All-Star: one in a thousand at most
    const m = helped(2, 0);
    expect(makeProb(m, shooter(m, 1, 14), 0, 'perfect', 0)).toBeLessThanOrEqual(0.001);
  });

  it('do not let fire move the heave line on the harder levels, as it always has on Rookie', () => {
    for (const shot of [0.3, 0.7, 1]) {
      for (const level of LEVELS) {
        const rules = DEEP_LEVELS[level];
        // just past the heave line of a shooter who is not on fire
        const d = shootingRange(shot) + rules.heavePast + 0.05;
        const m = helped(level, 0);
        const p = shooter(m, shot, d);
        expect(rangeBoost(p)).toBe(FIRE.range);
        const capped = makeProb(m, p, 0, 'perfect', 0) <= rules.heaveMin + rules.heaveBest * shot + 1e-12;
        expect(capped).toBe(level > 0);
        expect(isHeave(d, shot, rules.fireHeave ? rangeBoost(p) : 0, rules.heavePast)).toBe(level > 0);
      }
    }
  });

  it('let Hype and the rubber band fade out past range on the harder levels, and count in full inside it', () => {
    for (const level of LEVELS) {
      const plain = match(level);
      const hyped = match(level, 1);
      hyped.hypeT = [5, 0];
      hyped.score = [0, 12];
      const lift = (d: number) => makeProb(hyped, shooter(hyped, 0.9, d), 0, 'good', 0) - makeProb(plain, shooter(plain, 0.9, d), 0, 'good', 0);
      expect(lift(5)).toBeCloseTo(HYPE.shotBonus + 0.07, 10);
      const far = lift(shootingRange(0.9) + DEEP_LEVELS[level].timingFade + 0.01);
      if (level === 0) expect(far).toBeGreaterThan(0);
      else expect(far).toBe(0);
    }
  });

  it('let a long miss rattle in less the further out it is: all of them in range, a little on Rookie from anywhere, none on the harder levels from a heave', () => {
    for (const level of LEVELS) {
      const m = helped(level, 0);
      for (const shot of SHOOTERS) {
        let last = 1;
        for (let d = 1; d < 23; d += 0.1) {
          const p = shooter(m, shot, d);
          const luck = luckShare(m, p);
          if (d <= shootingRange(shot)) expect(luck).toBe(1);
          expect(luck).toBeLessThanOrEqual(last + 1e-12);
          last = luck;
        }
        // from the far half
        expect(luckShare(m, shooter(m, shot, 14))).toBeCloseTo(DEEP_LEVELS[level].luckLeft * shot, 12);
      }
    }
    expect(DEEP_LEVELS[0].luckLeft).toBeGreaterThan(0);
    expect(DEEP_LEVELS[1].luckLeft + DEEP_LEVELS[2].luckLeft).toBe(0);
  });
});

describe('which rules a game plays by', () => {
  const STARTERS: SidePlayer[] = [
    { id: 'wren-kowalski', level: 1 },
    { id: 'pippa-quinn', level: 1 },
    { id: 'gus-moretti', level: 1 },
  ];
  const prefs: Prefs = { squad: STARTERS, quarterSeconds: 60, easyShots: false, homeTeam: 'comets' };
  const level = (cfg: MatchConfig) => shotLevelOf(createMatch(cfg));

  it('a quick game plays by the level picked for it', () => {
    for (const difficulty of LEVELS) expect(level(buildMatch(quickSetup(prefs, { perTeam: 3, difficulty, opponent: 'yetis', court: null }, seededRng(3))).config)).toBe(difficulty);
  });

  it('two people play by Pro rules, on one screen or two devices', () => {
    for (const help of [0, 1, 2] as const) expect(level(buildMatch(duoSetup(prefs, { perTeam: 2, rival: null, court: null, help }, seededRng(4))).config)).toBe(1);
    const squad = { squad: STARTERS, uniform: null, easyShots: false };
    expect(level(buildMatch(onlineSetup(squad, { ...squad, easyShots: true }, 3, 60, seededRng(5))).config)).toBe(1);
  });

  it('ladder games get harder rules as the ladder climbs, from Rookie at the bottom to All-Star at the top', () => {
    const levels = TIERS.map((t) => level(buildMatch(ladderSetup(prefs, t.floor, 3, seededRng(6))).config));
    expect(levels[0]).toBe(0);
    expect(levels[levels.length - 1]).toBe(2);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
  });

  it('a match told no level plays by Rookie’s rules, the rules there always were', () => {
    const cfg = buildMatch(quickSetup(prefs, { perTeam: 3, difficulty: 2, opponent: 'yetis', court: null }, seededRng(3))).config;
    expect(level({ ...cfg, shotLevel: undefined })).toBe(0);
    for (const l of LEVELS) expect(level({ ...cfg, shotLevel: l })).toBe(l);
  });
});

describe('shots on the court, start to finish', () => {
  // an open shooter, perfectly timed, through the whole release, flight and rim, every shot its own match
  const BANDS = [
    { band: 'at the rim', d: 1.2, n: 100 },
    { band: 'mid range', d: 4.5, n: 100 },
    { band: 'at the arc', d: 6.25, n: 100 },
    { band: 'past range', d: 8, n: 100 },
    { band: 'deep', d: 9.5, n: 100 },
    { band: 'far half', d: 12, n: 240 },
  ] as const;
  const SHOOTERS = [
    { who: 'poor', shot: 0.2 },
    { who: 'average', shot: 0.5 },
    { who: 'great', shot: 0.9 },
  ] as const;
  /**
   * Rookie's makes, shots and makes that rattled in, recorded once Rookie's long misses stopped rattling in as often.
   * Inside range (at the rim, mid range, at the arc) these are the very counts the simulation gave before the levels
   * (commit d05d461); past range it gave, poor / average / great: past range 25 / 35 / 62, deep 22 / 22 / 29, and
   * from the far half 81 / 82 / 82 of 240, almost all of them rattles.
   */
  const ROOKIE: Record<string, Record<string, [number, number, number]>> = {
    poor: { 'at the rim': [84, 100, 5], 'mid range': [77, 100, 9], 'at the arc': [39, 100, 16], 'past range': [8, 100, 7], deep: [1, 100, 0], 'far half': [2, 240, 0] },
    average: { 'at the rim': [88, 100, 4], 'mid range': [81, 100, 7], 'at the arc': [51, 100, 12], 'past range': [28, 100, 16], deep: [2, 100, 1], 'far half': [9, 240, 6] },
    great: { 'at the rim': [90, 100, 2], 'mid range': [91, 100, 2], 'at the arc': [74, 100, 11], 'past range': [60, 100, 11], deep: [15, 100, 5], 'far half': [9, 240, 6] },
  };
  /** the computer's skill of each quick-game level */
  const DIFFICULTY = [0.22, 0.5, 0.82];
  const results: LabResult[][][] = [];
  const at = (level: number, who: number, band: number) => results[level][who][band];

  beforeAll(() => {
    for (const level of LEVELS) {
      results.push(SHOOTERS.map(({ shot }) => BANDS.map(({ d, n }) => shootAround({ shot }, [-0.3, 0, 0.3].map((angle) => ({ d, angle })), n, { difficulty: DIFFICULTY[level], shotLevel: level }))));
    }
  }, 120000);

  it('are taken against each quick-game level’s computer, by that level’s rules', () => {
    for (const level of LEVELS) expect(shotLevelFor(DIFFICULTY[level])).toBe(level);
  });

  it('go in on Rookie exactly as often as recorded, inside range as often as before the levels', () => {
    SHOOTERS.forEach(({ who }, w) =>
      BANDS.forEach(({ band }, b) => {
        const r = at(0, w, b);
        expect([`${who} ${band}`, r.makes, r.shots, r.rattled]).toEqual([`${who} ${band}`, ...ROOKIE[who][band]]);
        expect(r.stuck).toBe(0);
      }),
    );
  });

  it('go in as often on every level inside range, and never more often past it on a harder level', () => {
    SHOOTERS.forEach((_, w) =>
      BANDS.forEach(({ band }, b) => {
        for (const level of [1, 2] as const) {
          const r = at(level, w, b);
          const easier = at(level - 1, w, b);
          expect(r.shots).toBe(easier.shots);
          expect(r.stuck).toBe(0);
          if (band === 'at the rim' || band === 'mid range' || band === 'at the arc') expect(r).toEqual(easier);
          else expect(r.makes).toBeLessThanOrEqual(easier.makes);
        }
      }),
    );
    // past range the poor and average shooters lose makes on each harder level
    for (const w of [0, 1]) {
      expect(at(1, w, 3).makes).toBeLessThan(at(0, w, 3).makes);
      expect(at(2, w, 3).makes).toBeLessThan(at(1, w, 3).makes * 0.5);
    }
    // deep, Rookie stays clearly the most forgiving
    expect(at(0, 2, 4).makes).toBeGreaterThanOrEqual(3 * at(1, 2, 4).makes + 5);
    for (const w of [0, 1]) expect(at(0, w, 4).makes).toBeGreaterThan(at(1, w, 4).makes);
  });

  it('from the far half: now and then on Rookie (2 to 5 in 100 for a great shooter, fewer for a poor one), at most one in two hundred on Pro and one in a thousand on All-Star, rattles included', () => {
    const far = BANDS.length - 1;
    const rate = (level: number, w: number) => at(level, w, far).makes / at(level, w, far).shots;
    expect(rate(0, 2)).toBeGreaterThanOrEqual(0.02);
    expect(rate(0, 2)).toBeLessThanOrEqual(0.05);
    expect(rate(0, 0)).toBeLessThan(rate(0, 2));
    SHOOTERS.forEach((_, w) => {
      expect(rate(0, w)).toBeLessThanOrEqual(0.05);
      expect(at(0, w, far).best).toBeLessThanOrEqual(FAR_MOST[0] + 1e-12);
      // what rattles in on Rookie is a small share of the misses, a few in a hundred of the shots at most
      expect(at(0, w, far).rattled).toBeLessThanOrEqual(at(0, w, far).shots * 0.03);
      for (const level of [1, 2] as const) {
        const r = at(level, w, far);
        expect(r.best).toBeLessThanOrEqual(FAR_MOST[level] + 1e-12);
        // a miss from there stays out: every make was a make as it left the hand
        expect(r.rattled).toBe(0);
        // and the makes add up to no more than the chances allow (three standard deviations of room)
        expect(r.makes).toBeLessThanOrEqual(r.shots * FAR_MOST[level] + 3 * Math.sqrt(r.shots * FAR_MOST[level]));
      }
    });
    // deep but this side of half court: the harder levels shut it down too
    SHOOTERS.forEach((_, w) => expect(at(2, w, far - 1).makes).toBeLessThanOrEqual(1));
  });
});
