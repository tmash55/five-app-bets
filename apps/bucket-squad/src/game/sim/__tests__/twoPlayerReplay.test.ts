/**
 * Two-player games, on one screen and on two devices, come out exactly as they did before the computer got a level
 * table for games against one person (levels.ts) and the one-player game a new rubber band and a hidden nudge: they
 * play the computer's original way on both sides. The fingerprints in fixtures/twoPlayer.golden.json were recorded
 * with the code from before that change (commit 4c5baf9), each game built the way the app builds it, from the setup
 * on: so an online game between a build from before and one from after still plays the same on both devices.
 */

import golden from './fixtures/twoPlayer.golden.json';
import { TWO_PLAYER_CASES } from '@/testing/twoPlayerCases';
import { ScriptedThumb, traceGame, type Trace } from '@/testing/simTrace';

const RECORDED: Record<string, Trace> = golden as unknown as Record<string, Trace>;

describe('two-player games are unchanged', () => {
  it('has a recording for every case', () => {
    expect(Object.keys(RECORDED).sort()).toEqual(TWO_PLAYER_CASES.map((c) => c.name).sort());
  });

  for (const c of TWO_PLAYER_CASES) {
    it(`plays "${c.name}" exactly as recorded`, () => {
      const a = new ScriptedThumb(c.thumbs[0]);
      const b = new ScriptedThumb(c.thumbs[1]);
      expect(traceGame(c.cfg, { frames: () => [a.step(), b.step()] })).toEqual(RECORDED[c.name]);
    }, 60000);
  }
});
