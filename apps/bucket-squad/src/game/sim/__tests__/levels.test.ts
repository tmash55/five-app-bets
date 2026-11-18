/** The computer's play by level (levels.ts): the table's shape, and who plays by it. */

import { CPU_LEVELS, cpuLevel, facesPerson, levelOf, opponentLevel, steadyLevel, type CpuLevel } from '../levels';
import { bandOf } from '../seats';
import { createMatch } from '../sim';
import { traceConfig } from '@/testing/simTrace';

/** the knobs that make the computer better as they grow, and the ones that make it better as they shrink */
const UP: (keyof CpuLevel)[] = ['drive', 'burst', 'pass', 'perfect', 'good', 'make', 'dunkReach', 'juke', 'hustle', 'help', 'contest', 'rimJump', 'reach', 'stealHit', 'blockHit', 'intercept'];
const DOWN: (keyof CpuLevel)[] = ['think', 'badShot', 'sloppy', 'looseHandle', 'react', 'gap', 'contestLate', 'reachEvery', 'giveBlock'];

describe('the level table', () => {
  it('runs from the easiest computer to the hardest, every number in its place', () => {
    expect(CPU_LEVELS[0].at).toBe(0);
    expect(CPU_LEVELS[CPU_LEVELS.length - 1].at).toBe(1);
    expect(new Set([...UP, ...DOWN, 'at']).size).toBe(Object.keys(CPU_LEVELS[0]).length);
    for (const row of CPU_LEVELS) expect(Object.keys(row).sort()).toEqual(Object.keys(CPU_LEVELS[0]).sort());
    for (let i = 1; i < CPU_LEVELS.length; i++) {
      const lo = CPU_LEVELS[i - 1];
      const hi = CPU_LEVELS[i];
      expect(hi.at).toBeGreaterThan(lo.at);
      // every step up the table is a computer at least as good in every way
      for (const k of UP) expect(hi[k]).toBeGreaterThanOrEqual(lo[k]);
      for (const k of DOWN) expect(hi[k]).toBeLessThanOrEqual(lo[k]);
    }
  });

  it('keeps every chance a chance and every share a share', () => {
    for (const row of CPU_LEVELS) {
      for (const k of ['burst', 'badShot', 'pass', 'sloppy', 'perfect', 'good', 'make', 'dunkReach', 'juke', 'hustle', 'help', 'contest', 'rimJump', 'reach'] as const) {
        expect(row[k]).toBeGreaterThanOrEqual(0);
        expect(row[k]).toBeLessThanOrEqual(1);
      }
      expect(row.perfect + row.good).toBeLessThanOrEqual(1);
      expect(row.think).toBeGreaterThan(0);
    }
  });

  it('plays a skill between two rows in between them', () => {
    const lo = CPU_LEVELS[1];
    const hi = CPU_LEVELS[2];
    const mid = cpuLevel((lo.at + hi.at) / 2);
    expect(mid.make).toBeCloseTo((lo.make + hi.make) / 2, 10);
    expect(mid.react).toBeCloseTo((lo.react + hi.react) / 2, 10);
    expect(cpuLevel(lo.at)).toEqual(lo);
    expect(cpuLevel(-1)).toEqual(CPU_LEVELS[0]);
    expect(cpuLevel(2)).toEqual(CPU_LEVELS[CPU_LEVELS.length - 1]);
  });

  it('is easier at Rookie than the computer always was, and close to it at the top', () => {
    const rookie = cpuLevel(0.22);
    const old = steadyLevel(0.22);
    expect(rookie.make).toBeLessThan(old.make);
    expect(rookie.drive).toBeLessThan(old.drive);
    expect(rookie.react).toBeGreaterThan(old.react);
    expect(rookie.reach).toBeLessThan(old.reach);
    expect(rookie.contest).toBeLessThan(old.contest);
    expect(rookie.intercept).toBeLessThan(old.intercept);
    expect(rookie.stealHit).toBeLessThan(0);
    expect(rookie.blockHit).toBeLessThan(0);
    expect(rookie.looseHandle).toBeGreaterThan(0);
    expect(rookie.giveBlock).toBeGreaterThan(0);
    const top = cpuLevel(1);
    expect(top.make).toBeGreaterThan(0.9);
    expect(top.drive).toBeLessThanOrEqual(1);
  });
});

describe('who plays by the table', () => {
  it('is the computer against one person, and nobody else', () => {
    const one = createMatch(traceConfig(3));
    expect(facesPerson(one, 1)).toBe(true);
    expect(facesPerson(one, 0)).toBe(false);
    expect(opponentLevel(one, 1)).toEqual(cpuLevel(0.5));
    expect(opponentLevel(one, 0)).toBeNull();
    // a person's own teammates play the way the computer always did
    expect(levelOf(one, 0, 0.55)).toEqual(steadyLevel(0.55));
    expect(levelOf(one, 1, 0.5)).toEqual(cpuLevel(0.5));
    const away = createMatch(traceConfig(3, { userTeam: 1 }));
    expect(facesPerson(away, 0)).toBe(true);
    expect(facesPerson(away, 1)).toBe(false);
    // nobody playing, and two people: the computer's original play on both sides
    for (const cfg of [traceConfig(3, { userTeam: -1 }), traceConfig(3, { humans: [true, true] })]) {
      const m = createMatch(cfg);
      expect(facesPerson(m, 0)).toBe(false);
      expect(facesPerson(m, 1)).toBe(false);
      expect(opponentLevel(m, 1)).toBeNull();
      expect(levelOf(m, 1, 0.5)).toEqual(steadyLevel(0.5));
    }
  });

  it('switches off everything new in the computer’s original play', () => {
    const s = steadyLevel(0.4);
    expect(s).toMatchObject({ drive: 1, burst: 1, badShot: 0, sloppy: 0, make: 1, dunkReach: 1, looseHandle: 0, juke: 1, hustle: 1, react: 0, help: 1, stealHit: 0, blockHit: 0, giveBlock: 0 });
  });
});

describe('the rubber band against the computer', () => {
  it('helps the person while behind and pulls by the lead drag while ahead', () => {
    const m = createMatch(traceConfig(3, { rubberBand: 0.6, leadDrag: 0 }));
    // the person's own play: behind, helped in full; ahead, not held back
    expect(bandOf(m, 0, -0.5)).toBe(0.6);
    expect(bandOf(m, 0, 0.5)).toBe(0);
    // the computer's play: ahead, held back in full; behind, no help to catch up
    expect(bandOf(m, 1, 0.5)).toBe(0.6);
    expect(bandOf(m, 1, -0.5)).toBe(0);
    const away = createMatch(traceConfig(3, { userTeam: 1, rubberBand: 0.4, leadDrag: 0.1 }));
    expect(bandOf(away, 1, 0.5)).toBe(0.1);
    expect(bandOf(away, 0, -0.5)).toBe(0.1);
    expect(bandOf(away, 1, -0.5)).toBe(0.4);
  });

  it('pulls both ways as it always did without one', () => {
    const m = createMatch(traceConfig(3, { rubberBand: 0.4 }));
    expect(bandOf(m, 0, 0.5)).toBe(0.4);
    expect(bandOf(m, 0, -0.5)).toBe(0.4);
    expect(bandOf(m, 1, 0.5)).toBe(0.4);
  });
});
