/**
 * One-player games come out exactly as they did before two people could share a court. The fingerprints in
 * fixtures/onePlayer.golden.json were recorded from the simulation as it was before that change (commit 56a9e27):
 * every tick of each game, every player's position, speed, state and flame meter, the ball and the random numbers.
 */

import golden from './fixtures/onePlayer.golden.json';
import levelGolden from './fixtures/onePlayer.levels.golden.json';
import { shotLevelFor } from '../core';
import { GOLDEN_CASES } from '@/testing/goldenCases';
import { ScriptedThumb, traceGame, type Trace } from '@/testing/simTrace';

const RECORDED: Record<string, Trace> = golden as unknown as Record<string, Trace>;
const BY_LEVEL: Record<string, Trace> = levelGolden as unknown as Record<string, Trace>;

describe('one-player games are unchanged', () => {
  it('has a recording for every case', () => {
    expect(Object.keys(RECORDED).sort()).toEqual(GOLDEN_CASES.map((c) => c.name).sort());
  });

  for (const c of GOLDEN_CASES) {
    it(`plays "${c.name}" exactly as recorded`, () => {
      const t = traceGame(c.cfg, c.thumb === null ? undefined : { thumb: new ScriptedThumb(c.thumb) });
      expect(t).toEqual(RECORDED[c.name]);
    });
  }
});

/**
 * The same games by the long-shot rules of the level each one's computer plays at (Pro or All-Star; a game is told
 * its level by `buildMatch`, and one told none plays by Rookie's, as above). Recorded when the levels came in, after
 * checking where each first parts from its game above: every one that differs does so at a miss from the far half
 * (15 to 23 from the hoop) that rattled in by Rookie's rules and stays out by the harder ones.
 */
describe('one-player games by the harder levels’ long-shot rules', () => {
  const harder = GOLDEN_CASES.filter((c) => shotLevelFor(c.cfg.difficulty) > 0);

  it('has a recording for every case whose computer plays at Pro or All-Star', () => {
    expect(harder.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(BY_LEVEL).sort()).toEqual(harder.map((c) => c.name).sort());
  });

  for (const c of harder) {
    it(`plays "${c.name}" exactly as recorded`, () => {
      const t = traceGame({ ...c.cfg, shotLevel: shotLevelFor(c.cfg.difficulty) }, c.thumb === null ? undefined : { thumb: new ScriptedThumb(c.thumb) });
      expect(t).toEqual(BY_LEVEL[c.name]);
    });
  }
});
