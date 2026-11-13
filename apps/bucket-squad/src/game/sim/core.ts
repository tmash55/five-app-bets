/** Helpers shared by the simulation and the computer players. */

import { BALL_R, COURT, DEEP, DRIBBLE_H, DUNK, G_JUMP, SHOT } from './constants';
import { rangeBoost, reachBoost, shotBoost } from './fire';
import { clamp, clamp01, distToSegment, hypot2, lerp, smooth } from './math';
import type { Intent, MatchState, PlayerSim, ShotGrade, TeamId } from './types';

/** +1 when the team attacks the +X hoop. */
export function attackSign(team: TeamId): 1 | -1 {
  return team === 0 ? 1 : -1;
}

/** X of the hoop this team scores in. */
export function hoopXOf(team: TeamId): number {
  return attackSign(team) * COURT.hoopX;
}

export function distToHoop(p: PlayerSim): number {
  return hypot2(hoopXOf(p.team) - p.x, p.z);
}

export function isThree(x: number, z: number, team: TeamId): boolean {
  const d = hypot2(x - hoopXOf(team), z);
  return d >= COURT.threeR || Math.abs(z) >= COURT.cornerZ;
}

export function hypeOn(m: MatchState, team: TeamId): boolean {
  return m.hypeT[team] > 0;
}

export function resetIntent(it: Intent): Intent {
  it.mx = 0;
  it.mz = 0;
  it.turbo = false;
  it.shootPress = false;
  it.shoot = false;
  it.pass = false;
  it.passTo = -1;
  it.jump = false;
  it.steal = false;
  return it;
}

export function newIntent(): Intent {
  return resetIntent({} as Intent);
}

/** Time from the start of a jump shot to the top of the jump. */
export function shotApexTime(): number {
  return SHOT.crouch + Math.sqrt((2 * SHOT.jumpH) / G_JUMP);
}

export function shotJumpV0(): number {
  return Math.sqrt(2 * G_JUMP * SHOT.jumpH);
}

/** How far out this player can take off for a dunk. */
export function dunkRange(m: MatchState, p: PlayerSim): number {
  return lerp(DUNK.rangeMin, DUNK.rangeMax, p.attrs.dunk) * reachBoost(m, p);
}

export function canDunk(p: PlayerSim): boolean {
  return p.attrs.dunk >= DUNK.minAttr;
}

export function nearestOpponent(m: MatchState, p: PlayerSim): PlayerSim | null {
  let best: PlayerSim | null = null;
  let bd = 1e9;
  for (const o of m.players) {
    if (o.team === p.team) continue;
    const d = hypot2(o.x - p.x, o.z - p.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function nearestOpponentDist(m: MatchState, x: number, z: number, team: TeamId): number {
  let bd = 1e9;
  for (const o of m.players) {
    if (o.team === team) continue;
    if (o.state === 'stumble') continue;
    const d = hypot2(o.x - x, o.z - z);
    if (d < bd) bd = d;
  }
  return bd;
}

/** How hard the nearest defenders are bothering a shot from p's spot (0..1). */
export function shotContest(m: MatchState, p: PlayerSim): number {
  const hx = hoopXOf(p.team);
  let dx = hx - p.x;
  let dz = -p.z;
  const dl = hypot2(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  let c = 0;
  for (const o of m.players) {
    if (o.team === p.team || o.state === 'stumble') continue;
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const d = hypot2(ox, oz);
    if (d > 2.1) continue;
    const base = clamp01(1 - (d - 0.55) / 1.45);
    const up = o.state === 'jump' ? 1 + 0.25 * o.attrs.block : 0.55 + 0.15 * o.attrs.block;
    const front = d > 1e-3 ? (ox * dx + oz * dz) / d : 1;
    const side = 0.45 + 0.55 * clamp01(front + 0.35);
    c = Math.max(c, base * up * side);
  }
  return Math.min(1, c);
}

/**
 * How far from the hoop a shooter is still comfortable: a step behind the arc for a poor shooter, about two for
 * the best. Past it, shots fall off fast, and faster for a poor shooter. `extra` stretches it a little for a
 * shooter on fire.
 */
export function shootingRange(shot: number, extra = 0): number {
  return COURT.threeR + DEEP.grace + DEEP.reach * shot + extra;
}

/**
 * Beyond this, a shot is a heave: the timing of the release no longer helps and the chance is capped, at a few
 * in a hundred for the best shooter. From the far half of the court it is always a heave.
 */
export function isHeave(d: number, shot: number, extra = 0): boolean {
  return d >= COURT.hoopX || d > shootingRange(shot, extra) + DEEP.heavePast;
}

/** Chance that a shot goes in. Shared with the computer players' shot selection. */
export function makeProb(
  m: MatchState,
  p: PlayerSim,
  contest: number,
  grade: ShotGrade,
  moving: number,
): number {
  const d = distToHoop(p);
  const s = p.attrs.shot;
  const three = isThree(p.x, p.z, p.team);
  const extra = rangeBoost(p);
  // how far past the shooter's own range, and how much the timing of the release can still do from there
  const past = three ? Math.max(0, d - shootingRange(s, extra)) : 0;
  const timing = clamp01(1 - past / DEEP.timingFade);
  let base: number;
  if (d < 2.3) {
    base = 0.62 + 0.2 * (0.5 * s + 0.5 * p.attrs.dunk);
  } else if (!three) {
    base = 0.41 + 0.26 * s - 0.012 * (d - 2.3);
  } else {
    base = 0.1 + 0.34 * s - past * (DEEP.falloff + DEEP.falloffPoor * (1 - s));
  }
  let c = contest;
  if (grade === 'perfect') {
    // a perfect release counts most for the shooters who can shoot
    base += (three ? 0.06 + 0.18 * s : 0.24) * timing;
    c *= 0.55;
  } else if (grade === 'good') {
    base += 0.07 * timing;
  } else if (grade === 'ok') {
    base -= 0.04;
  } else {
    base -= 0.22;
  }
  base -= c * 0.4;
  // Hype and fire, together never more than FIRE.shotCap
  base += shotBoost(m, p);
  const diff = clamp(m.score[p.team] - m.score[1 - p.team], -12, 12) / 12;
  base -= diff * 0.07 * m.cfg.rubberBand;
  base -= Math.min(0.07, moving * 0.011);
  const chance = clamp(base, 0.02, 0.96);
  return three && isHeave(d, s, extra) ? Math.min(chance, DEEP.heaveMin + DEEP.heaveBest * s) : chance;
}

/** True when no defender stands in the corridor between (ax, az) and (bx, bz). */
export function laneClear(
  m: MatchState,
  team: TeamId,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  skip = -1,
): boolean {
  for (const o of m.players) {
    if (o.team === team || o.idx === skip || o.state === 'stumble') continue;
    if (distToSegment(o.x, o.z, ax, az, bx, bz) < width) return false;
  }
  return true;
}

/** Where a held ball sits. Hands are posed to reach it, so this owns the look of every hold. */
export function heldBallPos(m: MatchState, p: PlayerSim, out: { x: number; y: number; z: number }): void {
  heldBallSpot(m, p, out);
  // a player dribbling along the edge holds it out past them: it stays inside the same walls a loose ball does
  const lx = COURT.halfL + COURT.apron;
  const lz = COURT.halfW + COURT.apron;
  out.x = clamp(out.x, -lx, lx);
  out.z = clamp(out.z, -lz, lz);
}

function heldBallSpot(m: MatchState, p: PlayerSim, out: { x: number; y: number; z: number }): void {
  const fx = Math.cos(p.facing);
  const fz = Math.sin(p.facing);
  // the player's right-hand side
  const rx = -fz;
  const rz = fx;
  const speed = hypot2(p.vx, p.vz);
  const u = p.dribT - Math.floor(p.dribT);
  const bounce = 1 - (2 * u - 1) * (2 * u - 1);
  const dFwd = 0.27 + 0.03 * Math.min(8, speed);
  const dSide = 0.31 * p.hand;
  const dribX = p.x + fx * dFwd + rx * dSide;
  const dribZ = p.z + fz * dFwd + rz * dSide;
  const dribY = BALL_R + DRIBBLE_H * bounce;
  switch (p.state) {
    case 'shoot': {
      const k = smooth(p.t / 0.16);
      out.x = lerp(dribX, p.x + fx * SHOT.setPointFwd + rx * 0.06, k);
      out.z = lerp(dribZ, p.z + fz * SHOT.setPointFwd + rz * 0.06, k);
      // push up and out through the release
      const push = smooth((p.t - SHOT.crouch) / 0.24);
      out.y = lerp(Math.max(dribY, 0.75), p.y + lerp(1.05, SHOT.setPointUp, push), k);
      return;
    }
    case 'layup': {
      const k = smooth(p.t / 0.14);
      out.x = lerp(dribX, p.x + fx * 0.3 + rx * 0.12 * p.hand, k);
      out.z = lerp(dribZ, p.z + fz * 0.3 + rz * 0.12 * p.hand, k);
      out.y = lerp(Math.max(dribY, 0.75), p.y + lerp(0.95, 1.56, smooth(p.t / (p.dur * 0.5))), k);
      return;
    }
    case 'dunk':
    case 'oop': {
      const uu = clamp01(p.t / Math.max(0.01, p.dur));
      const k = smooth(p.t / 0.14);
      let fwd = 0.3;
      let up: number = DUNK.handUp;
      let side = 0;
      if (p.style === 'windmill') {
        // the ball swings down, back and over the top in one big circle
        const th = clamp01((uu - 0.08) / 0.72) * Math.PI * 1.3;
        fwd = 0.22 - Math.sin(th) * 0.42;
        up = 1.08 - Math.cos(th) * 0.5;
      } else if (p.style === 'tomahawk') {
        // cocked back behind the head, then thrown down
        const cock = Math.sin(Math.PI * clamp01((uu - 0.2) / 0.7));
        fwd = lerp(0.3, 0.02, cock * 0.9);
        up = DUNK.handUp + 0.06 * cock;
        side = 0.16 * cock;
      }
      // the slam always finishes at the same reach, so the ball lands in the rim
      const fin = smooth((uu - 0.82) / 0.18);
      fwd = lerp(fwd, DUNK.endBack, fin);
      up = lerp(up, DUNK.handUp, fin);
      side *= 1 - fin;
      const hx = p.x + fx * fwd + rx * side * p.hand;
      const hz = p.z + fz * fwd + rz * side * p.hand;
      const hy = p.y + up;
      if (p.state === 'oop') {
        out.x = hx;
        out.y = hy;
        out.z = hz;
        return;
      }
      out.x = lerp(dribX, hx, k);
      out.z = lerp(dribZ, hz, k);
      out.y = lerp(Math.max(dribY, 0.8), hy, k);
      return;
    }
    case 'pass': {
      out.x = p.x + fx * 0.36;
      out.z = p.z + fz * 0.36;
      out.y = p.y + 0.82;
      return;
    }
    case 'jump':
    case 'recover':
    case 'hang': {
      // holding it high after a rebound, or coming down with it
      const k = p.state === 'jump' ? 1 : 1 - smooth(p.t / 0.12);
      out.x = lerp(dribX, p.x + fx * 0.3, k);
      out.z = lerp(dribZ, p.z + fz * 0.3, k);
      out.y = lerp(dribY, p.y + 1.35, k);
      return;
    }
    default: {
      // dribbling; for a beat after a catch the ball is held at the chest
      const hold = 1 - smooth(p.catchT / 0.22);
      out.x = lerp(dribX, p.x + fx * 0.34, hold);
      out.z = lerp(dribZ, p.z + fz * 0.34, hold);
      out.y = lerp(dribY, p.y + 0.85, hold);
    }
  }
}

/** 0..1+ progress of the shot meter for the controlled player (1 = perfect), or -1 when hidden. */
export function shotMeter(m: MatchState): { value: number; perfect: number; good: number } | null {
  if (m.control < 0) return null;
  const p = m.players[m.control];
  if (p.state !== 'shoot' || p.released) return null;
  const tA = shotApexTime();
  return {
    value: p.t / tA,
    perfect: (SHOT.perfectWin * m.cfg.timingAssist) / tA,
    good: (SHOT.goodWin * m.cfg.timingAssist) / tA,
  };
}
