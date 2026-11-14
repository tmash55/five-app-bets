/**
 * One-player games come out exactly as they did before two people could share a court. The fingerprints in
 * fixtures/onePlayer.golden.json were recorded from the simulation as it was before that change (commit 56a9e27):
 * every tick of each game, every player's position, speed, state and flame meter, the ball and the random numbers.
 */

import golden from './fixtures/onePlayer.golden.json';
import { GOLDEN_CASES } from '@/testing/goldenCases';
import { ScriptedThumb, traceGame, type Trace } from '@/testing/simTrace';

const RECORDED: Record<string, Trace> = golden as unknown as Record<string, Trace>;

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
