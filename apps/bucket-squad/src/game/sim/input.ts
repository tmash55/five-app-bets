/**
 * Input frames: one team's stick and buttons for one tick, as plain data.
 *
 * The match only ever reads frames, a frame per team per tick (`TeamFrames`), and it is deterministic, so two
 * machines that step the same match with the same frames stay in step. For play over a network each side sends its
 * own frame for every tick and steps with both. Both sides must step with exactly the same numbers, so a frame is
 * first rounded to what `packFrame` keeps (`quantizeFrame`), on the side it comes from as well.
 */

import type { InputFrame, TeamFrames } from './types';

/** steps of the stick on each axis, either way from the middle */
const STICK_STEPS = 127;

const BIT_A = 1;
const BIT_B = 2;
const BIT_TURBO = 4;
const BIT_SW = 8;

export function emptyFrame(): InputFrame {
  return { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
}

function axis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-STICK_STEPS, Math.min(STICK_STEPS, Math.round(v * STICK_STEPS)));
}

/**
 * A frame as one whole number: the buttons in the low four bits, then each stick axis in eight bits. Fits in a
 * 32-bit integer, survives JSON, and unpacks to the same frame on any machine.
 */
export function packFrame(f: InputFrame): number {
  const buttons = (f.a ? BIT_A : 0) | (f.b ? BIT_B : 0) | (f.turbo ? BIT_TURBO : 0) | (f.sw ? BIT_SW : 0);
  return buttons + (axis(f.mx) + STICK_STEPS) * 16 + (axis(f.mz) + STICK_STEPS) * 16 * 256;
}

export function unpackFrame(n: number, out: InputFrame = emptyFrame()): InputFrame {
  const v = Math.max(0, Math.floor(n));
  const buttons = v % 16;
  const x = Math.floor(v / 16) % 256;
  const z = Math.floor(v / (16 * 256)) % 256;
  out.mx = (x - STICK_STEPS) / STICK_STEPS;
  out.mz = (z - STICK_STEPS) / STICK_STEPS;
  out.a = (buttons & BIT_A) !== 0;
  out.b = (buttons & BIT_B) !== 0;
  out.turbo = (buttons & BIT_TURBO) !== 0;
  out.sw = (buttons & BIT_SW) !== 0;
  return out;
}

/** The frame as the other machine will see it (see the note at the top). */
export function quantizeFrame(f: InputFrame, out: InputFrame = emptyFrame()): InputFrame {
  return unpackFrame(packFrame(f), out);
}

/** Copy a frame's numbers into another, so a source can hand out a frame it keeps writing to. */
export function copyFrame(from: InputFrame, to: InputFrame): InputFrame {
  to.mx = from.mx;
  to.mz = from.mz;
  to.turbo = from.turbo;
  to.a = from.a;
  to.b = from.b;
  to.sw = from.sw;
  return to;
}

/** Frames for a tick from what each team's source gave: null for a team nobody plays. */
export function teamFrames(home: InputFrame | null, away: InputFrame | null): TeamFrames {
  return [home, away];
}
