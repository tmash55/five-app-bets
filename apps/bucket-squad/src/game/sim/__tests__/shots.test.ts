import { COURT } from '../constants';
import { attackSign, hoopXOf, isHeave, makeProb, shootingRange } from '../core';
import { createMatch } from '../sim';
import type { Attrs, MatchConfig, MatchState, PlayerSim, ShotGrade } from '../types';

function attrs(shot: number): Attrs {
  return { speed: 0.6, shot, dunk: 0.5, handle: 0.6, steal: 0.5, block: 0.5 };
}

function match(rubberBand = 0): MatchState {
  const team = () => ({ players: [{ id: 'a', attrs: attrs(0.5) }, { id: 'b', attrs: attrs(0.5) }] });
  const cfg: MatchConfig = { seed: 1, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand, autoSwitch: true };
  return createMatch(cfg);
}

/** a shooter of team 0, `d` from the hoop straight out from it, with the given shooting */
function shooter(m: MatchState, shot: number, d: number): PlayerSim {
  const p = m.players.find((q) => q.team === 0)!;
  p.attrs = attrs(shot);
  p.x = hoopXOf(0) - attackSign(0) * d;
  p.z = 0;
  return p;
}

const odds = (shot: number, d: number, grade: ShotGrade, m = match()) => makeProb(m, shooter(m, shot, d), 0, grade, 0);
const GRADES: ShotGrade[] = ['perfect', 'good', 'ok', 'bad'];

describe('shots from far out', () => {
  it('never get easier further from the hoop, for any shooter or release', () => {
    for (const shot of [0.1, 0.4, 0.7, 1]) {
      for (const grade of GRADES) {
        let last = 1;
        for (let d = COURT.threeR + 0.05; d < 22; d += 0.25) {
          const p = odds(shot, d, grade);
          expect(p).toBeLessThanOrEqual(last + 1e-9);
          last = p;
        }
      }
    }
  });

  it('give a good shooter more range than a poor one', () => {
    expect(shootingRange(0.9)).toBeGreaterThan(shootingRange(0.3) + 0.8);
    const d = COURT.threeR + 1.2;
    expect(odds(0.9, d, 'perfect')).toBeGreaterThan(0.5);
    expect(odds(0.3, d, 'perfect')).toBeLessThan(0.22);
  });

  it('make a heave from the far half of the court a long shot, even timed perfectly, hyped and behind', () => {
    const m = match(1);
    m.score = [0, 12];
    m.hypeT = [5, 0];
    for (const shot of [0.2, 0.6, 1]) {
      for (const d of [COURT.hoopX, 14, 18, 22]) {
        expect(isHeave(d, shot)).toBe(true);
        expect(makeProb(m, shooter(m, shot, d), 0, 'perfect', 0)).toBeLessThanOrEqual(0.03 + 1e-9);
      }
    }
  });

  it('still let the best shooter hit now and then from near half court', () => {
    const p = odds(1, COURT.hoopX - 0.5, 'perfect');
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.08);
  });

  it('leave close shots as they were', () => {
    expect(odds(0.5, 1.5, 'good')).toBeGreaterThan(0.7);
    expect(odds(0.5, 4, 'perfect')).toBeGreaterThan(0.75);
  });
});
