import { COURT, DT, FIRE, HYPE, MOVE } from '../constants';
import { attackSign, dunkRange, hoopXOf, isHeave, makeProb, newIntent, shootingRange } from '../core';
import { cool, defenseBoost, fireOut, heatScale, heatUp, ignite, shotBoost, speedBoost, stepFire, streakMult } from '../fire';
import { createMatch, moveFree, stepMatch } from '../sim';
import type { Attrs, MatchConfig, MatchState, PadInput, PlayerSim, SimEvent } from '../types';

const PAD: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

function config(seed: number, over: Partial<MatchConfig> = {}): MatchConfig {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.35 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.4 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ],
  });
  return { seed, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand: 0, autoSwitch: true, ...over };
}

function live(over: Partial<MatchConfig> = {}): MatchState {
  const m = createMatch(config(5, over));
  m.phase = 'live';
  m.events.length = 0;
  return m;
}

const fires = (m: MatchState) => m.events.filter((e): e is Extract<SimEvent, { type: 'fire' }> => e.type === 'fire');

/** a shooter of team 0 `d` from the hoop, straight out from it */
function shooter(m: MatchState, shot: number, d: number): PlayerSim {
  const p = m.players[0];
  p.attrs = attrs({ shot });
  p.x = hoopXOf(0) - attackSign(0) * d;
  p.z = 0;
  return p;
}

describe('the flame meter', () => {
  it('fills by a different amount for each kind of play', () => {
    const plays = [FIRE.two, FIRE.three, FIRE.dunk, FIRE.oop, FIRE.assist, FIRE.steal, FIRE.block, FIRE.reboundOff, FIRE.reboundDef, FIRE.perfect];
    expect(new Set(plays).size).toBe(plays.length);
    expect(FIRE.three).toBeGreaterThan(FIRE.two);
    expect(FIRE.oop).toBeGreaterThan(FIRE.dunk);
    expect(FIRE.dunk).toBeGreaterThan(FIRE.two);
    expect(FIRE.reboundOff).toBeGreaterThan(FIRE.reboundDef);
    const m = live();
    const [a, b] = m.players;
    heatUp(m, a, FIRE.three);
    heatUp(m, b, FIRE.reboundDef);
    expect(a.heat).toBeCloseTo(FIRE.three);
    expect(b.heat).toBeCloseTo(FIRE.reboundDef);
  });

  it('fills when players score, pass, steal, block and rebound in a real game', () => {
    const m = createMatch(config(21));
    const before = new Float64Array(m.players.length);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 200 && m.phase !== 'final'; i++) {
      for (const p of m.players) before[p.idx] = p.heat;
      stepMatch(m, PAD);
      const lit = new Set(fires(m).map((e) => e.player));
      for (const e of m.events) {
        const who = e.type === 'score' ? [e.by, e.assist] : e.type === 'steal' || e.type === 'block' || e.type === 'rebound' ? [e.by] : [];
        for (const k of who) {
          if (k < 0 || lit.has(k) || before[k] >= FIRE.max) continue;
          expect(m.players[k].heat).toBeGreaterThan(before[k]);
          seen.add(e.type);
        }
      }
    }
    expect(seen.has('score')).toBe(true);
    expect(seen.has('rebound')).toBe(true);
    expect(seen.has('steal')).toBe(true);
  });

  it('builds faster for plays in a row, and a miss ends the run', () => {
    expect(streakMult(0)).toBe(1);
    expect(streakMult(1)).toBeCloseTo(1.3);
    expect(streakMult(2)).toBeCloseTo(1.6);
    expect(streakMult(20)).toBe(FIRE.streakMax);
    const m = live();
    const [a, b] = m.players;
    // three twos in a row against three twos with a miss between each
    for (let i = 0; i < 3; i++) heatUp(m, a, FIRE.two);
    for (let i = 0; i < 3; i++) {
      heatUp(m, b, FIRE.two);
      cool(b, 0);
    }
    expect(a.heat).toBeCloseTo(FIRE.two * (1 + 1.3 + 1.6));
    expect(b.heat).toBeCloseTo(FIRE.two * 3);
    expect(a.streak).toBe(3);
    expect(b.streak).toBe(0);
    // a run also ends when nothing good happens for a while
    for (let t = 0; t < FIRE.streakWindow + 0.5; t += DT) stepFire(m);
    expect(a.streak).toBe(0);
  });

  it('cools down by itself, and for misses, turnovers and being scored on', () => {
    const m = live();
    const p = m.players[0];
    p.heat = 50;
    for (let t = 0; t < 10; t += DT) stepFire(m);
    expect(p.heat).toBeCloseTo(50 - 10 * FIRE.decay, 0);
    const h = p.heat;
    cool(p, FIRE.miss);
    expect(p.heat).toBeCloseTo(h - FIRE.miss);
    expect(FIRE.turnover).toBeGreaterThan(FIRE.miss);
    expect(FIRE.scoredOn).toBeGreaterThan(0);
  });

  it('sets a player on fire when it is full, for a set time of live play', () => {
    const m = live();
    const p = m.players[1];
    p.heat = FIRE.max - 1;
    heatUp(m, p, FIRE.two);
    expect(p.fireT).toBe(FIRE.duration);
    expect(p.heat).toBe(FIRE.max);
    expect(fires(m)).toEqual([{ type: 'fire', player: 1, on: true }]);
    m.events.length = 0;
    // more good plays while burning do not start it again
    heatUp(m, p, FIRE.three);
    expect(fires(m)).toEqual([]);
    let t = 0;
    while (p.fireT > 0 && t < 60) {
      m.events.length = 0;
      stepFire(m);
      t += DT;
    }
    expect(t).toBeCloseTo(FIRE.duration, 1);
    expect(fires(m)).toEqual([{ type: 'fire', player: 1, on: false }]);
    expect(p.heat).toBe(0);
  });

  it('only burns down during live play', () => {
    const m = live();
    const p = m.players[0];
    ignite(m, p);
    m.phase = 'scored';
    for (let i = 0; i < 60; i++) stepMatch(m, PAD);
    expect(p.fireT).toBe(FIRE.duration);
  });

  it('goes out when the other team scores', () => {
    // in real games: the fire goes out in the very step the other team scores, or when its time is up
    let early = 0;
    for (const seed of [8, 9, 10, 12]) {
      const m = createMatch(config(seed));
      const hot = m.players[0];
      ignite(m, hot);
      let burned = 0;
      let outWith: SimEvent[] | null = null;
      for (let i = 0; i < 60 * 200 && m.phase !== 'final'; i++) {
        if (m.phase === 'live') burned += DT;
        stepMatch(m, PAD);
        if (fires(m).some((e) => e.player === hot.idx && !e.on)) {
          outWith = [...m.events];
          break;
        }
      }
      expect(outWith).not.toBeNull();
      const byThem = outWith!.some((e) => e.type === 'score' && e.team === 1);
      if (byThem) early++;
      else expect(burned).toBeCloseTo(FIRE.duration, 1);
      expect(hot.heat).toBe(0);
      expect(hot.fireT).toBe(0);
    }
    expect(early).toBeGreaterThan(0);
    const m2 = live();
    ignite(m2, m2.players[0]);
    ignite(m2, m2.players[3]);
    m2.events.length = 0;
    fireOut(m2, 0);
    expect(m2.players[0].fireT).toBe(0);
    expect(m2.players[3].fireT).toBe(FIRE.duration);
    expect(fires(m2)).toEqual([{ type: 'fire', player: 0, on: false }]);
  });

  it('fills slower for the computer on easy levels, and never faster for the team that is behind', () => {
    const rookie = live({ userTeam: 0, difficulty: 0.22 });
    const allStar = live({ userTeam: 0, difficulty: 0.82 });
    const cpuRookie = heatScale(rookie, rookie.players[3]);
    const cpuAllStar = heatScale(allStar, allStar.players[3]);
    expect(cpuRookie).toBeLessThan(0.8);
    expect(cpuAllStar).toBeCloseTo(1);
    expect(heatScale(rookie, rookie.players[0])).toBe(1);
    // the rubber band leaves the meter alone
    const behind = live({ userTeam: 0, difficulty: 0.82, rubberBand: 1 });
    behind.score = [30, 2];
    const p = behind.players[3];
    heatUp(behind, p, FIRE.three);
    const q = allStar.players[3];
    heatUp(allStar, q, FIRE.three);
    expect(p.heat).toBeCloseTo(q.heat);
    expect(p.fireT).toBe(0);
  });
});

describe('a player on fire', () => {
  it('shoots better, from a little further out', () => {
    const m = live();
    const d = COURT.threeR + 1;
    const p = shooter(m, 0.6, d);
    const cold = makeProb(m, p, 0.3, 'good', 0);
    const coldRange = shootingRange(0.6);
    ignite(m, p);
    const hot = makeProb(m, p, 0.3, 'good', 0);
    expect(hot).toBeGreaterThan(cold + 0.08);
    expect(shootingRange(0.6, FIRE.range)).toBeGreaterThan(coldRange + 0.5);
    expect(shootingRange(0.6, FIRE.range)).toBeLessThan(coldRange + 1.01);
  });

  it('still only makes a heave from the far half now and then, even hyped and behind', () => {
    const m = live({ rubberBand: 1 });
    m.score = [0, 12];
    m.hypeT = [5, 0];
    for (const shot of [0.2, 0.6, 1]) {
      for (const d of [COURT.hoopX, 14, 18, 22]) {
        const p = shooter(m, shot, d);
        ignite(m, p);
        expect(isHeave(d, shot, FIRE.range)).toBe(true);
        expect(makeProb(m, p, 0, 'perfect', 0)).toBeLessThanOrEqual(0.03 + 1e-9);
      }
    }
  });

  it('runs faster, reaches further for dunks and has quicker hands, and none of it without fire', () => {
    const m = live();
    const p = m.players[0];
    m.control = -1;
    const run = () => {
      p.vx = 0;
      p.vz = 0;
      const it = newIntent();
      it.mx = 1;
      for (let i = 0; i < 90; i++) {
        p.x = 0;
        moveFree(m, p, it, 1);
      }
      return p.vx;
    };
    const coldSpeed = run();
    const coldReach = dunkRange(m, p);
    expect(defenseBoost(m, p, 0.1)).toBe(0);
    expect(shotBoost(m, p)).toBe(0);
    ignite(m, p);
    expect(run()).toBeCloseTo(coldSpeed * FIRE.speedMult, 3);
    expect(dunkRange(m, p)).toBeCloseTo(coldReach * FIRE.dunkReach);
    expect(defenseBoost(m, p, 0.1)).toBeCloseTo(FIRE.stealBonus);
    expect(shotBoost(m, p)).toBeCloseTo(FIRE.shotBonus);
  });

  it('stacks with the team’s Hype only up to a cap', () => {
    const m = live();
    const p = m.players[0];
    ignite(m, p);
    m.hypeT = [5, 0];
    expect(shotBoost(m, p)).toBeCloseTo(FIRE.shotCap);
    expect(shotBoost(m, p)).toBeGreaterThan(HYPE.shotBonus);
    expect(speedBoost(m, p)).toBeCloseTo(FIRE.speedCap);
    expect(speedBoost(m, p)).toBeGreaterThan(MOVE.hypeMult);
    expect(defenseBoost(m, p, 0.12, FIRE.blockBonus)).toBeCloseTo(FIRE.defenseCap);
  });
});

describe('fire and the match as a whole', () => {
  function play(cfg: MatchConfig) {
    const m = createMatch(cfg);
    const log: string[] = [];
    let ticks = 0;
    while (m.phase !== 'final' && ticks < 60 * 60 * 12) {
      stepMatch(m, PAD);
      for (const e of m.events) if (e.type === 'fire') log.push(`${m.tick}:${e.player}:${e.on ? 1 : 0}`);
      ticks++;
    }
    return { m, log };
  }

  it('is the same game for the same seed, fires and all', () => {
    let any = 0;
    for (const seed of [11, 4242]) {
      const a = play(config(seed));
      const b = play(config(seed));
      expect(a.log).toEqual(b.log);
      expect(a.m.score).toEqual(b.m.score);
      expect(a.m.players.map((p) => p.heat)).toEqual(b.m.players.map((p) => p.heat));
      any += a.log.length;
    }
    // fire does happen in an ordinary game
    expect(any).toBeGreaterThan(0);
  });
});
