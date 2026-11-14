/**
 * On fire: every player has a flame meter of their own. Good plays fill it (some more than others, and more when
 * they come in a row); misses, turnovers and getting scored on cool it down, and it drains slowly by itself. A full
 * meter sets that player on fire for `FIRE.duration` seconds of live play: better and longer shooting, faster legs,
 * quicker hands. A basket by the other team puts the fire out.
 *
 * The team's Hype stays the whole-team boost; the two stack, up to the caps in `FIRE`.
 */

import { DT, FIRE, HYPE, MOVE } from './constants';
import { clamp01, lerp } from './math';
import { anyHuman, isHuman } from './seats';
import type { MatchState, PlayerSim, TeamId } from './types';

export function onFire(p: PlayerSim): boolean {
  return p.fireT > 0;
}

function hyped(m: MatchState, team: TeamId): boolean {
  return m.hypeT[team] > 0;
}

/** Two boosts on top of each other, kept under a cap (but never below either one alone). */
export function stack(a: number, b: number, cap: number): number {
  return a + b <= cap ? a + b : Math.max(a, b, cap);
}

/**
 * How fast this player's meter fills. A person's players fill at the full rate (both sides, with two people); a computer opponent fills slower
 * at the easy levels and at about the same rate at All-Star. The score plays no part: the rubber band that keeps
 * games close never hands the team that is behind a quicker fire.
 */
export function heatScale(m: MatchState, p: PlayerSim): number {
  if (!anyHuman(m) || isHuman(m, p.team)) return 1;
  return lerp(FIRE.cpuMin, 1, clamp01((m.cfg.difficulty - FIRE.cpuEasy) / (FIRE.cpuHard - FIRE.cpuEasy)));
}

/** What the next good play is worth, as a multiple, after `streak` good plays in a row. */
export function streakMult(streak: number): number {
  return Math.min(FIRE.streakMax, 1 + FIRE.streakStep * streak);
}

export function ignite(m: MatchState, p: PlayerSim): void {
  const was = p.fireT > 0;
  p.fireT = FIRE.duration;
  p.heat = FIRE.max;
  p.streak = 0;
  p.streakT = 0;
  if (!was) m.events.push({ type: 'fire', player: p.idx, on: true });
}

export function douse(m: MatchState, p: PlayerSim): void {
  if (p.fireT <= 0) return;
  p.fireT = 0;
  p.heat = 0;
  p.streak = 0;
  m.events.push({ type: 'fire', player: p.idx, on: false });
}

/**
 * A good play worth `base`. It counts toward the streak unless it rides along with another play (a perfect release
 * on top of the basket it makes). A meter that fills sets the player on fire.
 */
export function heatUp(m: MatchState, p: PlayerSim, base: number, inARow = true): void {
  if (p.fireT > 0) return;
  p.heat = Math.min(FIRE.max, p.heat + base * streakMult(p.streak) * heatScale(m, p));
  if (inARow) {
    p.streak++;
    p.streakT = 0;
  }
  if (p.heat >= FIRE.max) ignite(m, p);
}

/** A bad play: the streak is over and some heat goes. A player already on fire keeps burning. */
export function cool(p: PlayerSim, amount: number): void {
  if (p.fireT > 0) return;
  p.streak = 0;
  p.heat = Math.max(0, p.heat - amount);
}

/** The other team scored: every fire on this team goes out. */
export function fireOut(m: MatchState, team: TeamId): void {
  for (const p of m.players) if (p.team === team) douse(m, p);
}

/** One tick of live play: fires burn down, meters drain, streaks run out. */
export function stepFire(m: MatchState): void {
  for (const p of m.players) {
    if (p.fireT > 0) {
      p.fireT -= DT;
      if (p.fireT <= 0) {
        p.fireT = 0;
        p.heat = 0;
        p.streak = 0;
        m.events.push({ type: 'fire', player: p.idx, on: false });
      }
      continue;
    }
    p.heat = Math.max(0, p.heat - FIRE.decay * DT);
    p.streakT += DT;
    if (p.streakT > FIRE.streakWindow) p.streak = 0;
  }
}

// ---------------------------------------------------------------------------
// What fire (and Hype) does
// ---------------------------------------------------------------------------

/** Extra chance on a jump shot. */
export function shotBoost(m: MatchState, p: PlayerSim): number {
  return stack(hyped(m, p.team) ? HYPE.shotBonus : 0, onFire(p) ? FIRE.shotBonus : 0, FIRE.shotCap);
}

/** How much further than usual this shooter is comfortable from. */
export function rangeBoost(p: PlayerSim): number {
  return onFire(p) ? FIRE.range : 0;
}

/** Top speed multiplier. */
export function speedBoost(m: MatchState, p: PlayerSim): number {
  const v = (hyped(m, p.team) ? MOVE.hypeMult : 1) * (onFire(p) ? FIRE.speedMult : 1);
  return Math.min(FIRE.speedCap, v);
}

/** Extra steal or block chance; `hypeBonus` is what Hype alone gives for that play. */
export function defenseBoost(m: MatchState, p: PlayerSim, hypeBonus: number, fireBonus: number = FIRE.stealBonus): number {
  return stack(hyped(m, p.team) ? hypeBonus : 0, onFire(p) ? fireBonus : 0, FIRE.defenseCap);
}

/** Dunk take-off range multiplier. */
export function reachBoost(m: MatchState, p: PlayerSim): number {
  const v = (hyped(m, p.team) ? HYPE.dunkReach : 1) * (onFire(p) ? FIRE.dunkReach : 1);
  return Math.min(FIRE.reachCap, v);
}
