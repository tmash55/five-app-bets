/** Small numeric helpers shared by the sim and the renderer. */

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smooth(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export function easeOut(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u;
}

export function easeIn(t: number): number {
  const u = clamp01(t);
  return u * u;
}

export function hypot2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

/** Shortest signed difference between two angles. */
export function angDiff(to: number, from: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(from: number, to: number, maxStep: number): number {
  const d = angDiff(to, from);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export function approach(from: number, to: number, maxStep: number): number {
  const d = to - from;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Deterministic generator (mulberry32). The state is a 32-bit integer kept by
 * the caller so match state stays plain data.
 */
export function rngNext(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngRange(state: { rng: number }, lo: number, hi: number): number {
  return lo + (hi - lo) * rngNext(state);
}

/** Roughly normal sample in [-1, 1] (sum of three uniforms). */
export function rngBell(state: { rng: number }): number {
  return (rngNext(state) + rngNext(state) + rngNext(state)) * (2 / 3) - 1;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Distance from point p to segment a-b in the XZ plane. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp01(t);
  return hypot2(px - (ax + dx * t), pz - (az + dz * t));
}
