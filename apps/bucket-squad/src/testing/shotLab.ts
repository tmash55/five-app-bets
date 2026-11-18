/**
 * A shooting range for tests: one open shooter takes shot after shot from a spot through the real match (the press,
 * the jump, the release, the flight and the rim), with everybody else sent to the far corner so nobody contests,
 * blocks or rebounds. Counts what goes in, and how much of it went in off the rim on a shot that was meant to miss.
 */

import { BALL_R, COURT } from '@/game/sim/constants';
import { makeProb, shotApexTime } from '@/game/sim/core';
import { hypot2 } from '@/game/sim/math';
import { createMatch, stepMatch } from '@/game/sim/sim';
import type { Attrs, MatchConfig, MatchState, PadInput } from '@/game/sim/types';

export interface LabShooter {
  shot: number;
  /** 0..1; below the dunk minimum a shot at the rim is a layup */
  dunk?: number;
}

export interface LabSpot {
  /** distance from the hoop */
  d: number;
  /** how far round from straight out (radians) */
  angle: number;
}

export interface LabOptions {
  /** the computer's skill */
  difficulty: number;
  /** the long-shot rules: 0 Rookie, 1 Pro, 2 All-Star */
  shotLevel: 0 | 1 | 2;
  /** when to let go, in seconds after the top of the jump: 0 is a perfect release */
  late?: number;
  /** each shot is its own little match from this seed on */
  seed?: number;
  over?: Partial<MatchConfig>;
  /** done to the match just before each shot (Hype, fire, the score) */
  before?: (m: MatchState) => void;
}

export interface LabResult {
  shots: number;
  makes: number;
  /** makes that were meant to miss and dropped in off the rim or the board */
  rattled: number;
  /** the chances the shots had as they left the hand, added up (what `makes` should come to, give or take luck) */
  expected: number;
  /** the best chance any one of them had */
  best: number;
  /** shots still bouncing about up high after three seconds (none, or the rim has trapped the ball) */
  stuck: number;
  /** what kind of shot it turned out to be */
  kinds: Record<string, number>;
  grades: Record<string, number>;
}

function attrs(v: Partial<Attrs>): Attrs {
  return { speed: 0.6, shot: 0.5, dunk: 0.2, handle: 0.99, steal: 0.5, block: 0.5, ...v };
}

function labConfig(seed: number, s: LabShooter, o: LabOptions): MatchConfig {
  const mate = { id: 'm', attrs: attrs({ handle: 0.2 }) };
  return {
    seed,
    teams: [{ players: [{ id: 's', attrs: attrs({ shot: s.shot, dunk: s.dunk ?? 0.2 }) }, mate] }, { players: [{ id: 'x', attrs: attrs({ handle: 0.5 }) }, { id: 'y', attrs: attrs({ handle: 0.3 }) }] }],
    userTeam: 0,
    quarters: 4,
    quarterSeconds: 999,
    difficulty: o.difficulty,
    shotLevel: o.shotLevel,
    mateSkill: 0.55,
    timingAssist: 1,
    rubberBand: 0.4,
    autoSwitch: false,
    ...o.over,
  };
}

const PARK: [number, number][] = [
  [-11.6, -5.6],
  [-11.6, 5.6],
  [-11.6, 0],
];

/** Everybody but the shooter waits in the far corner, out of the way. */
function park(m: MatchState, shooter: number): void {
  let i = 0;
  for (const p of m.players) {
    if (p.idx === shooter) continue;
    const [x, z] = PARK[i++ % PARK.length];
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
  }
}

/** One shot from `spot`, counted into `out`. */
function oneShot(seed: number, s: LabShooter, spot: LabSpot, o: LabOptions, out: LabResult): void {
  const m = createMatch(labConfig(seed, s, o));
  const p = m.players[0];
  p.x = COURT.hoopX - Math.cos(spot.angle) * spot.d;
  p.z = Math.sin(spot.angle) * spot.d;
  p.facing = Math.atan2(-p.z, COURT.hoopX - p.x);
  m.phase = 'live';
  m.phaseT = 0;
  m.control = p.idx;
  o.before?.(m);
  const pad: PadInput = { mx: 0, mz: 0, turbo: false, a: true, b: false, sw: false };
  const tA = shotApexTime() + (o.late ?? 0);
  let planned: boolean | null = null;
  for (let tick = 0; tick < 600; tick++) {
    park(m, p.idx);
    m.clock = 999;
    m.shotClock = 99;
    // let go on the tick nearest the moment wanted
    if (p.state === 'shoot' && !p.released && p.t + 1 / 120 >= tA - 1 / 60) pad.a = false;
    stepMatch(m, pad);
    for (const e of m.events) {
      if (e.type === 'shot' && e.by === p.idx) {
        out.shots++;
        out.grades[e.grade] = (out.grades[e.grade] ?? 0) + 1;
        // the same numbers the release itself just used: the shooter is standing still and nothing else has moved
        const chance = makeProb(m, p, e.contest, e.grade, hypot2(p.vx, p.vz));
        out.expected += chance;
        out.best = Math.max(out.best, chance);
      }
      if (e.type === 'score') {
        if (e.team === 0) {
          out.makes++;
          out.kinds[e.kind] = (out.kinds[e.kind] ?? 0) + 1;
          if (planned === false) out.rattled++;
        }
        return;
      }
      if (e.type === 'block') return;
    }
    const b = m.ball;
    if (b.state === 'shot' && planned === null) planned = b.planned;
    // back in someone's hands, or down on the floor: it can no longer drop in
    if (planned !== null && (b.state === 'held' || (b.state === 'loose' && b.y <= BALL_R + 0.01))) return;
    if (b.state === 'loose' && b.looseT > 3) {
      out.stuck++;
      return;
    }
    if (m.phase !== 'live') return;
  }
}

/** `n` shots from the spots in turn. */
export function shootAround(s: LabShooter, spots: readonly LabSpot[], n: number, o: LabOptions): LabResult {
  const out: LabResult = { shots: 0, makes: 0, rattled: 0, expected: 0, best: 0, stuck: 0, kinds: {}, grades: {} };
  const seed = o.seed ?? 1;
  // every shot its own well spread seed
  for (let i = 0; i < n; i++) oneShot((Math.imul(seed + i, 0x9e3779b1) >>> 1) || 1, s, spots[i % spots.length], o, out);
  return out;
}
