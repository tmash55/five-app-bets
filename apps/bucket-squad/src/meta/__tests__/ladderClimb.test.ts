/**
 * The ladder climbs gently: each tier a little harder than the one below, measured with whole games of the real
 * setups and a made-up person on the pad (testing/playerModel.ts). The numbers were measured with these very games.
 */

import { TIERS } from '../ladder';
import { playLevel, type LabReport } from '@/testing/difficultyLab';
import { AVERAGE, BEGINNER, GOOD } from '@/testing/playerModel';

const SLOW = 180000;

describe('the ladder', () => {
  let byTier: LabReport[] = [];
  beforeAll(() => {
    byTier = TIERS.map((_, tier) => playLevel({ kind: 'ladder', tier }, AVERAGE, 24, 1));
  }, SLOW);

  it('gets a little harder at every tier for an adult new to the game', () => {
    const margins = byTier.map((r) => r.margin);
    for (let t = 1; t < margins.length; t++) {
      // never a big step, and never much easier than the tier below
      expect(margins[t - 1] - margins[t]).toBeLessThan(8);
      expect(margins[t]).toBeLessThan(margins[t - 1] + 3);
    }
    expect(margins[0] - margins[margins.length - 1]).toBeGreaterThan(20);
    expect(byTier[0].winRate).toBeGreaterThanOrEqual(0.85);
    expect(byTier[byTier.length - 1].winRate).toBeLessThanOrEqual(0.25);
  });

  it('starts with tiers a young beginner wins most of the time', () => {
    const rookie = playLevel({ kind: 'ladder', tier: 0 }, BEGINNER, 40, 1);
    expect(rookie.winRate).toBeGreaterThanOrEqual(0.7);
    expect(rookie.winRate).toBeLessThanOrEqual(0.9);
    expect(rookie.blowoutLosses).toBe(0);
    expect(playLevel({ kind: 'ladder', tier: 1 }, BEGINNER, 40, 1).winRate).toBeGreaterThan(0.5);
  }, SLOW);

  it('tops out where a good player still wins now and then', () => {
    const top = playLevel({ kind: 'ladder', tier: TIERS.length - 1 }, GOOD, 30, 1);
    expect(top.winRate).toBeGreaterThanOrEqual(0.15);
    expect(top.winRate).toBeLessThan(playLevel({ kind: 'ladder', tier: TIERS.length - 2 }, GOOD, 30, 1).winRate);
  }, SLOW);
});
