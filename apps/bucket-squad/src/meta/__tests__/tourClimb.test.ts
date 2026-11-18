/**
 * The tour climbs gently: each stop a little harder than the last, from a first stop a young beginner wins most of the
 * time to a last one at All-Star's skill. Measured with whole games of the real setups and a made-up person on the pad
 * (testing/playerModel.ts); the numbers were measured with these very games.
 */

import { tourById } from '../tour';
import { playLevel, type LabReport } from '@/testing/difficultyLab';
import { AVERAGE, BEGINNER, GOOD } from '@/testing/playerModel';

const SLOW = 180000;
const STOPS = tourById('neighborhood', 'comets').stages.length;

describe('the tour', () => {
  let rivalries: LabReport[] = [];
  beforeAll(() => {
    rivalries = Array.from({ length: STOPS }, (_, stage) => playLevel({ kind: 'tour', stage, game: 1 }, AVERAGE, 24, 1));
  }, SLOW);

  it('gets a little harder at every stop for an adult new to the game', () => {
    const margins = rivalries.map((r) => r.margin);
    for (let s = 1; s < margins.length; s++) {
      expect(margins[s - 1] - margins[s]).toBeLessThan(8);
      expect(margins[s]).toBeLessThan(margins[s - 1] + 3);
    }
    expect(margins[0] - margins[margins.length - 1]).toBeGreaterThan(15);
    expect(rivalries[0].winRate).toBeGreaterThanOrEqual(0.9);
    expect(rivalries[rivalries.length - 1].winRate).toBeLessThanOrEqual(0.4);
  });

  it('opens with stops a young beginner wins most of the time', () => {
    for (const [stage, game] of [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]) {
      const r = playLevel({ kind: 'tour', stage, game }, BEGINNER, 30, 1);
      expect(r.winRate).toBeGreaterThanOrEqual(0.65);
      expect(r.blowoutLosses).toBe(0);
    }
  }, SLOW);

  it('ends with a showdown a good player still wins now and then', () => {
    const last = playLevel({ kind: 'tour', stage: STOPS - 1, game: 2 }, GOOD, 30, 1);
    expect(last.winRate).toBeGreaterThanOrEqual(0.2);
    expect(last.winRate).toBeLessThanOrEqual(0.6);
  }, SLOW);

  it('never puts the computer above All-Star’s skill', () => {
    const top = Math.max(...tourById('neighborhood', 'comets').stages.flatMap((s) => s.games.map((g) => g.difficulty)));
    expect(top).toBeLessThanOrEqual(0.82 + 1e-9);
  });
});
