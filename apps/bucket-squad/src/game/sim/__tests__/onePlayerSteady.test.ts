/**
 * The one-player games recorded again when the computer got its level table (levels.ts) differ from their old
 * recordings only because of that table: with the table switched off, so the computer plays a person the way it
 * always did, every one of them still plays exactly as recorded before (commit 4c5baf9). Those old recordings are
 * kept in fixtures/onePlayer.steady.golden.json; the games as they play now are in onePlayer.golden.json and
 * onePlayer.levels.golden.json (see onePlayer.test.ts).
 */

import steady from './fixtures/onePlayer.steady.golden.json';
import { shotLevelFor } from '../core';
import { GOLDEN_CASES } from '@/testing/goldenCases';
import { ScriptedThumb, traceGame, type Trace } from '@/testing/simTrace';

// the table switched off: the computer against a person plays as everyone else does, by its skill alone
jest.mock('../levels', () => {
  const actual = jest.requireActual('../levels');
  return { ...actual, levelOf: (_m: unknown, _team: unknown, skill: number) => actual.steadyLevel(skill), opponentLevel: () => null };
});

const OLD = steady as unknown as { plain: Record<string, Trace>; levels: Record<string, Trace> };

describe('with the level table switched off', () => {
  it('has the old recording of every game recorded again', () => {
    // every game a person plays was recorded again; the one with nobody playing never changed
    expect(Object.keys(OLD.plain).sort()).toEqual(GOLDEN_CASES.filter((c) => c.cfg.userTeam !== -1).map((c) => c.name).sort());
    expect(Object.keys(OLD.levels).sort()).toEqual(GOLDEN_CASES.filter((c) => c.cfg.userTeam !== -1 && shotLevelFor(c.cfg.difficulty) > 0).map((c) => c.name).sort());
  });

  for (const c of GOLDEN_CASES) {
    const thumb = () => (c.thumb === null ? undefined : { thumb: new ScriptedThumb(c.thumb) });
    if (OLD.plain[c.name]) {
      it(`plays "${c.name}" exactly as it did before the table`, () => {
        expect(traceGame(c.cfg, thumb())).toEqual(OLD.plain[c.name]);
      });
    }
    if (OLD.levels[c.name]) {
      it(`plays "${c.name}" by its level’s long-shot rules exactly as it did before the table`, () => {
        expect(traceGame({ ...c.cfg, shotLevel: shotLevelFor(c.cfg.difficulty) }, thumb())).toEqual(OLD.levels[c.name]);
      });
    }
  }
});
