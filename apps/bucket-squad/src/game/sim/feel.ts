/**
 * How each player moves, from their card: quick guards burst and cut sharper, big players are heavier to start and
 * turn but harder to push off a spot, and good dribblers lose less speed with the ball.
 */

import { MOVE } from './constants';
import { clamp01, lerp } from './math';
import type { Attrs, Handling } from './types';

/** 0..1 how heavy a player plays: slow feet and a shot blocker's frame make a big. */
export function weightOf(a: Attrs): number {
  return clamp01(0.5 + 0.6 * (a.block - a.speed));
}

/** 0..1 how quick a player's feet are: speed first, then handles, and less for a heavy frame. */
export function agilityOf(a: Attrs, weight: number): number {
  return clamp01(0.5 * a.speed + 0.35 * a.handle + 0.15 * (1 - weight));
}

/** The movement numbers for one player at a given agility (the person's own player never drops below `MOVE.controlAgility`). */
export function handlingAt(agility: number, weight: number, handle: number, out?: Handling): Handling {
  const k = clamp01(agility);
  const h = out ?? ({} as Handling);
  h.agility = k;
  h.weight = clamp01(weight);
  h.accel = lerp(MOVE.accelMin, MOVE.accelMax, k);
  h.decel = lerp(MOVE.decelMin, MOVE.decelMax, k);
  h.cut = lerp(MOVE.cutMin, MOVE.cutMax, k);
  h.turn = lerp(MOVE.turnMin, MOVE.turnMax, k);
  h.ballMult = lerp(MOVE.ballMultMin, MOVE.ballMultMax, clamp01(handle));
  return h;
}

export function handling(a: Attrs, weight?: number): Handling {
  const w = weight ?? weightOf(a);
  return handlingAt(agilityOf(a, w), w, a.handle);
}

/**
 * Of a push between two bodies that would otherwise be shared evenly, the share the first one takes: the heavier
 * one gives less ground.
 */
export function pushShare(weightA: number, weightB: number, even = 0.5): number {
  return clamp01(even + MOVE.weightPush * (weightB - weightA));
}
