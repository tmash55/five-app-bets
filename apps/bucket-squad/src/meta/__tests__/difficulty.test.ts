/**
 * How hard each quick-game level is, measured: whole games of the real setups with a made-up person on the pad
 * (testing/playerModel.ts), from a young beginner to a good player. The numbers below were measured with these very
 * games (the same seeds, so they come out the same every run); before the levels were retuned a beginner won 2 in 100
 * on Rookie and an adult new to the game 2 in 100 on Pro, and the computer scored on four turns in five.
 */

import { playLevel, type LabLevel, type LabReport } from '@/testing/difficultyLab';
import { AVERAGE, BEGINNER, GOOD, type PlayerSkill } from '@/testing/playerModel';

const ROOKIE: LabLevel = { kind: 'quick', difficulty: 0 };
const PRO: LabLevel = { kind: 'quick', difficulty: 1 };
const ALL_STAR: LabLevel = { kind: 'quick', difficulty: 2 };

const runs = new Map<string, LabReport>();
function games(level: LabLevel, skill: PlayerSkill, n: number): LabReport {
  const key = `${JSON.stringify(level)} ${skill.name} ${n}`;
  let r = runs.get(key);
  if (!r) {
    r = playLevel(level, skill, n, 1);
    runs.set(key, r);
  }
  return r;
}

const SLOW = 120000;

describe('Rookie', () => {
  it('is won most of the time by a young beginner, without blowouts either way', () => {
    const r = games(ROOKIE, BEGINNER, 60);
    expect(r.winRate).toBeGreaterThanOrEqual(0.7);
    expect(r.winRate).toBeLessThanOrEqual(0.9);
    expect(r.margin).toBeGreaterThan(0);
    expect(r.margin).toBeLessThan(10);
    expect(r.blowoutWins).toBeLessThanOrEqual(0.15);
    expect(r.blowoutLosses).toBeLessThanOrEqual(0.05);
  }, SLOW);

  it('lets a beginner stop the computer: it scores less, turns it over, and loses the ball to their swipes', () => {
    const r = games(ROOKIE, BEGINNER, 60);
    // before: 1.59 points a turn, a stop one turn in five, 75 in 100 of its shots in, 2.5 steals by the person
    expect(r.cpuPpp).toBeLessThan(1);
    expect(r.stopRate).toBeGreaterThanOrEqual(0.5);
    expect(r.cpuFgPct).toBeLessThan(0.45);
    expect(r.steals).toBeGreaterThanOrEqual(3);
    expect(r.cpuTurnovers).toBeGreaterThanOrEqual(4.5);
  }, SLOW);

  it('is won in three on three too, still without many blowouts', () => {
    const r = games({ ...ROOKIE, perTeam: 3 }, BEGINNER, 40);
    expect(r.winRate).toBeGreaterThanOrEqual(0.7);
    expect(r.blowoutWins).toBeLessThanOrEqual(0.15);
    expect(r.blowoutLosses).toBe(0);
  }, SLOW);

  it('is easy for anyone better', () => {
    expect(games(ROOKIE, AVERAGE, 30).winRate).toBeGreaterThanOrEqual(0.85);
    expect(games(ROOKIE, GOOD, 30).winRate).toBeGreaterThanOrEqual(0.95);
  }, SLOW);
});

describe('Pro', () => {
  it('is won about half the time by an adult new to the game, in close games', () => {
    const r = games(PRO, AVERAGE, 60);
    expect(r.winRate).toBeGreaterThanOrEqual(0.4);
    expect(r.winRate).toBeLessThanOrEqual(0.62);
    expect(Math.abs(r.margin)).toBeLessThan(4);
    expect(r.blowoutLosses).toBeLessThanOrEqual(0.1);
  }, SLOW);

  it('is a step up for a beginner and won by a good player', () => {
    expect(games(PRO, BEGINNER, 30).winRate).toBeLessThanOrEqual(0.3);
    expect(games(PRO, GOOD, 30).winRate).toBeGreaterThanOrEqual(0.75);
  }, SLOW);
});

describe('All-Star', () => {
  it('is won a fair share of the time by a good player', () => {
    const r = games(ALL_STAR, GOOD, 60);
    expect(r.winRate).toBeGreaterThanOrEqual(0.35);
    expect(r.winRate).toBeLessThanOrEqual(0.65);
  }, SLOW);

  it('is rarely won by a beginner, and less often by an adult new to the game than Pro is', () => {
    expect(games(ALL_STAR, BEGINNER, 30).winRate).toBeLessThanOrEqual(0.1);
    const avg = games(ALL_STAR, AVERAGE, 30);
    expect(avg.winRate).toBeLessThanOrEqual(0.35);
    expect(avg.winRate).toBeLessThan(games(PRO, AVERAGE, 60).winRate);
  }, SLOW);
});

describe('from level to level', () => {
  it('gets harder for everyone, and the computer scores more at each one', () => {
    for (const [skill, n] of [
      [BEGINNER, [60, 30, 30]],
      [AVERAGE, [30, 60, 30]],
      [GOOD, [30, 30, 60]],
    ] as const) {
      const [r, p, a] = [games(ROOKIE, skill, n[0]), games(PRO, skill, n[1]), games(ALL_STAR, skill, n[2])];
      expect(r.margin).toBeGreaterThan(p.margin);
      expect(p.margin).toBeGreaterThan(a.margin);
      expect(r.cpuPpp).toBeLessThan(p.cpuPpp);
      expect(p.cpuPpp).toBeLessThan(a.cpuPpp);
    }
  }, SLOW);
});
