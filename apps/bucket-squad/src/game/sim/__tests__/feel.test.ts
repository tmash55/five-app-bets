import { DT, MOVE } from '../constants';
import { newIntent } from '../core';
import { handling, weightOf } from '../feel';
import { createMatch, moveFree, separatePlayers } from '../sim';
import type { Attrs, MatchConfig, MatchState, PlayerSim } from '../types';

const GUARD: Attrs = { speed: 0.9, shot: 0.6, dunk: 0.4, handle: 0.9, steal: 0.6, block: 0.2 };
const BIG: Attrs = { speed: 0.3, shot: 0.3, dunk: 0.8, handle: 0.3, steal: 0.3, block: 0.9 };
const MID: Attrs = { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5 };

function match(a: Attrs[], b: Attrs[] = [MID, MID, MID]): MatchState {
  const cfg: MatchConfig = {
    seed: 3,
    teams: [{ players: a.map((attrs, i) => ({ id: `a${i}`, attrs })) }, { players: b.map((attrs, i) => ({ id: `b${i}`, attrs })) }],
    userTeam: -1,
    quarters: 4,
    quarterSeconds: 60,
    difficulty: 0.6,
    mateSkill: 0.6,
    timingAssist: 1,
    rubberBand: 0,
    autoSwitch: true,
  };
  const m = createMatch(cfg);
  m.phase = 'live';
  m.control = -1;
  for (const p of m.players) {
    p.hasBall = false;
    p.state = 'free';
    p.vx = 0;
    p.vz = 0;
    // in a row along the court, well apart
    p.x = -10 + p.idx * 4;
    p.z = 0;
  }
  // the ball is dead out of the way, so nobody turns to watch it
  m.ball.state = 'dead';
  m.ball.x = 0;
  m.ball.z = -50;
  return m;
}

function top(p: PlayerSim): number {
  return (MOVE.speedMin + (MOVE.speedMax - MOVE.speedMin) * p.attrs.speed) * (p.hasBall ? p.feel.ballMult : 1);
}

/** steps until the player runs at `frac` of their own top speed one way along x, starting from where they are */
function stepsTo(m: MatchState, p: PlayerSim, dir: 1 | -1, frac = 0.95): number {
  const it = newIntent();
  it.mx = dir;
  let n = 0;
  while (p.vx * dir < frac * top(p) && n < 600) {
    p.x = 0;
    moveFree(m, p, it, 1);
    n++;
  }
  return n;
}

describe('how players move', () => {
  it('works out a heavier, slower frame for a big and quicker feet for a guard', () => {
    expect(weightOf(BIG)).toBeGreaterThan(0.7);
    expect(weightOf(GUARD)).toBeLessThan(0.25);
    const g = handling(GUARD);
    const b = handling(BIG);
    expect(g.accel).toBeGreaterThan(b.accel * 1.2);
    expect(g.cut).toBeGreaterThan(b.cut * 1.3);
    expect(g.turn).toBeGreaterThan(b.turn * 1.3);
    // a middling player moves about the way everyone used to (accel 40, decel 52, turn 15)
    const mid = handling(MID);
    expect(mid.accel).toBeGreaterThan(38);
    expect(mid.accel).toBeLessThan(46);
    expect(mid.turn).toBeGreaterThan(13.5);
    expect(mid.turn).toBeLessThan(17.5);
  });

  it('lets a quick guard reach top speed and turn back faster than a big', () => {
    const m = match([GUARD, BIG, MID]);
    const [g, b] = m.players;
    const gUp = stepsTo(m, g, 1);
    const bUp = stepsTo(m, b, 1);
    expect(gUp).toBeLessThan(bUp);
    const gBack = stepsTo(m, g, -1);
    const bBack = stepsTo(m, b, -1);
    expect(gBack).toBeLessThan(bBack);
    // nobody is slow to answer: even the big turns a full sprint round in well under half a second
    expect(bBack * DT).toBeLessThan(0.45);
  });

  it('keeps the player in the person’s hands responsive whoever it is', () => {
    const slow: Attrs = { speed: 0, shot: 0.2, dunk: 0.5, handle: 0, steal: 0.2, block: 1 };
    const m = match([slow, MID, MID]);
    const p = m.players[0];
    const alone = stepsTo(m, p, 1);
    p.vx = 0;
    m.control = p.idx;
    const held = stepsTo(m, p, 1);
    expect(held).toBeLessThan(alone);
    // and a quick player in the person's hands keeps all of their quickness
    const m2 = match([GUARD, MID, MID]);
    const q = m2.players[0];
    const free = stepsTo(m2, q, 1);
    q.vx = 0;
    m2.control = q.idx;
    expect(stepsTo(m2, q, 1)).toBe(free);
  });

  it('lets a good dribbler keep more speed with the ball', () => {
    const good: Attrs = { ...MID, handle: 0.95 };
    const poor: Attrs = { ...MID, handle: 0.1 };
    const m = match([good, poor, MID]);
    const [a, b] = m.players;
    a.hasBall = true;
    b.hasBall = true;
    const it = newIntent();
    it.mx = 1;
    for (let i = 0; i < 120; i++) {
      moveFree(m, a, it, 1);
      moveFree(m, b, it, 1);
    }
    expect(a.vx).toBeGreaterThan(b.vx * 1.06);
    expect(a.vx / (MOVE.speedMin + (MOVE.speedMax - MOVE.speedMin) * MID.speed)).toBeGreaterThan(0.98);
    expect(b.vx / (MOVE.speedMin + (MOVE.speedMax - MOVE.speedMin) * MID.speed)).toBeLessThan(0.93);
  });

  it('pushes a big off the spot less than a guard when they bump', () => {
    const m = match([GUARD, BIG, MID]);
    const [g, b] = m.players;
    g.x = 0;
    b.x = 0.4;
    separatePlayers(m);
    const gMoved = Math.abs(g.x - 0);
    const bMoved = Math.abs(b.x - 0.4);
    expect(bMoved).toBeLessThan(gMoved * 0.7);
  });

  it('makes a big harder to knock off the ball than a guard against the same defender', () => {
    const run = (handler: Attrs) => {
      const m = match([handler, MID, MID], [MID, MID, MID]);
      const h = m.players[0];
      const d = m.players[3];
      h.hasBall = true;
      h.x = 0;
      h.vx = 3;
      d.x = 0.5;
      separatePlayers(m);
      return { pushed: -h.x, kept: h.vx };
    };
    const guard = run(GUARD);
    const big = run(BIG);
    expect(big.pushed).toBeLessThan(guard.pushed);
    expect(big.kept).toBeGreaterThan(guard.kept);
  });
});
