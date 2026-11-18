/**
 * One-player games come out exactly as they did before two people could share a court. The fingerprints in
 * fixtures/onePlayer.golden.json were recorded from the simulation as it was before that change (commit 56a9e27):
 * every tick of each game, every player's position, speed, state and flame meter, the ball and the random numbers.
 *
 * These games play by Rookie's long-shot rules. When Rookie's long misses stopped rattling in as often, seven of the
 * eight were recorded again, each only after checking where it first parts from its old recording: at a miss from the
 * far half (15 to 23 from the hoop) that rattled in by the old rules and stays out now. "person, hands off" never
 * takes such a shot and is still the recording from 56a9e27.
 *
 * When the computer got its level table for games against a person (levels.ts), every case a person plays in was
 * recorded again, here and in onePlayer.levels.golden.json; "computer only" never meets the table and is unchanged.
 * Each was recorded again only after checking where it first parts from its old recording: at the first tick of live
 * play (3.05 s in), where the computer's defenders now look up at where to stand only now and then (the table's
 * `react`), or, in "person away, scripted", where the computer's ball handler first decides whether to sprint on
 * its drive (`burst`, a new random number) 3.25 s in. With the table switched off, all of them still play exactly as
 * they did before it (onePlayerSteady.test.ts keeps their old recordings and checks that).
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
 * checking where each first parts from its game by the rules before the levels: every one that differs does so at a
 * miss from the far half (15 to 23 from the hoop) that rattled in by those rules and stays out by the harder ones.
 * Recorded again with the level table, the same way and for the same reasons as above.
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
