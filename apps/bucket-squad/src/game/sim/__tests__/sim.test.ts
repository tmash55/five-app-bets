import { COURT, DT } from '../constants';
import { createMatch, stepMatch } from '../sim';
import type { Attrs, MatchConfig, MatchState, PadInput, SimEvent } from '../types';

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
  return {
    seed,
    teams: [team(), team()],
    userTeam: -1,
    quarters: 4,
    quarterSeconds: 60,
    difficulty: 0.6,
    mateSkill: 0.6,
    timingAssist: 1,
    rubberBand: 0,
    autoSwitch: true,
    ...over,
  };
}

function finite(m: MatchState): boolean {
  const b = m.ball;
  if (![b.x, b.y, b.z, b.vx, b.vy, b.vz].every(Number.isFinite)) return false;
  return m.players.every((p) => [p.x, p.z, p.y, p.vx, p.vz, p.facing].every(Number.isFinite));
}

function play(cfg: MatchConfig, maxTicks = 60 * 60 * 12) {
  const m = createMatch(cfg);
  const counts: Record<string, number> = {};
  const events: SimEvent[] = [];
  let ticks = 0;
  while (m.phase !== 'final' && ticks < maxTicks) {
    stepMatch(m, PAD);
    for (const e of m.events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      events.push(e);
    }
    ticks++;
    if (!finite(m)) throw new Error(`non-finite state at tick ${ticks}`);
  }
  return { m, counts, events, ticks };
}

describe('match simulation', () => {
  it('plays a full computer-only game to a result', () => {
    const { m, counts } = play(config(7));
    expect(m.phase).toBe('final');
    expect(m.winner).toBeGreaterThanOrEqual(0);
    expect(m.score[0]).not.toBe(m.score[1]);
    expect(m.score[0] + m.score[1]).toBeGreaterThan(20);
    expect(counts.score).toBeGreaterThan(8);
    expect(counts.pass).toBeGreaterThan(5);
  });

  it('is deterministic for a seed', () => {
    const a = play(config(1234));
    const b = play(config(1234));
    expect(a.m.score).toEqual(b.m.score);
    expect(a.ticks).toBe(b.ticks);
    expect(a.m.ball.x).toBe(b.m.ball.x);
    const c = play(config(99));
    expect(c.ticks !== a.ticks || c.m.score[0] !== a.m.score[0] || c.m.score[1] !== a.m.score[1]).toBe(true);
  });

  it('keeps everybody on the court and the ball in play', () => {
    const m = createMatch(config(42));
    for (let i = 0; i < 60 * 150 && m.phase !== 'final'; i++) {
      stepMatch(m, PAD);
      for (const p of m.players) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(COURT.halfL + COURT.apron + 1e-6);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(COURT.halfW + COURT.apron + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(4);
      }
      expect(m.ball.y).toBeGreaterThan(0);
      expect(m.ball.y).toBeLessThan(12);
      expect(Math.abs(m.ball.x)).toBeLessThanOrEqual(COURT.halfL + COURT.apron + 1e-6);
    }
  });

  it('produces a varied game across many seeds', () => {
    const totals: Record<string, number> = {};
    let points = 0;
    let games = 0;
    let fga = 0;
    let fgm = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { m, counts } = play(config(seed * 7919));
      for (const k of Object.keys(counts)) totals[k] = (totals[k] ?? 0) + counts[k];
      points += m.score[0] + m.score[1];
      games++;
      for (const s of m.stats) {
        fga += s.fga;
        fgm += s.fgm;
      }
    }
    const perGame = points / games;
    // an arcade pace: plenty of scoring in four one-minute quarters
    expect(perGame).toBeGreaterThan(36);
    expect(perGame).toBeLessThan(130);
    expect(fgm / fga).toBeGreaterThan(0.35);
    expect(fgm / fga).toBeLessThan(0.75);
    expect(totals.rebound).toBeGreaterThan(games * 3);
    expect(totals.steal).toBeGreaterThan(games);
    expect(totals.block ?? 0).toBeGreaterThan(0);
    expect(totals.dunkStart).toBeGreaterThan(games * 2);
  });

  it('lets a person score by pressing shoot near the hoop', () => {
    const m = createMatch(config(5, { userTeam: 0 }));
    const pad: PadInput = { ...PAD };
    let scored = false;
    for (let i = 0; i < 60 * 40 && !scored; i++) {
      const p = m.players[m.control];
      pad.mx = 0;
      pad.mz = 0;
      pad.a = false;
      pad.turbo = true;
      if (p && p.team === 0 && p.hasBall) {
        const dx = COURT.hoopX - p.x;
        const dz = -p.z;
        const d = Math.hypot(dx, dz);
        pad.mx = dx / d;
        pad.mz = dz / d;
        pad.a = d < 2.6;
      }
      stepMatch(m, pad);
      if (m.events.some((e) => e.type === 'score' && e.team === 0)) scored = true;
    }
    expect(scored).toBe(true);
  });

  it('runs fast enough for a phone', () => {
    const m = createMatch(config(3));
    const t0 = Date.now();
    const n = 60 * 60;
    for (let i = 0; i < n && m.phase !== 'final'; i++) stepMatch(m, PAD);
    const perTick = (Date.now() - t0) / n;
    expect(perTick).toBeLessThan(DT * 1000 * 0.25);
  });
});
