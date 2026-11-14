/** Input frames: plain data that packs into one number and comes back the same on any machine. */

import { copyFrame, emptyFrame, packFrame, quantizeFrame, unpackFrame } from '../input';
import type { InputFrame } from '../types';

describe('input frames', () => {
  it('is plain data that survives JSON', () => {
    const f: InputFrame = { mx: 0.5, mz: -1, turbo: true, a: false, b: true, sw: false };
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });

  it('packs a still pad and a full one into whole numbers that fit 32 bits', () => {
    const still = packFrame(emptyFrame());
    expect(Number.isInteger(still)).toBe(true);
    expect(unpackFrame(still)).toEqual(emptyFrame());
    const full = packFrame({ mx: 1, mz: 1, turbo: true, a: true, b: true, sw: true });
    expect(full).toBeLessThan(2 ** 20);
    expect(unpackFrame(full)).toEqual({ mx: 1, mz: 1, turbo: true, a: true, b: true, sw: true });
  });

  it('keeps every button on its own', () => {
    for (const key of ['a', 'b', 'turbo', 'sw'] as const) {
      const f = { ...emptyFrame(), [key]: true };
      const back = unpackFrame(packFrame(f));
      expect(back).toEqual(f);
    }
  });

  it('rounds the stick to 127 steps a side, and a rounded frame packs to itself', () => {
    const f: InputFrame = { mx: 0.3333, mz: -0.7071, turbo: false, a: true, b: false, sw: false };
    const q = quantizeFrame(f);
    expect(Math.abs(q.mx - f.mx)).toBeLessThanOrEqual(0.5 / 127 + 1e-12);
    expect(Math.abs(q.mz - f.mz)).toBeLessThanOrEqual(0.5 / 127 + 1e-12);
    expect(packFrame(q)).toBe(packFrame(f));
    expect(quantizeFrame(q)).toEqual(q);
  });

  it('clamps a stick pushed past its rim and ignores numbers that are not numbers', () => {
    const back = unpackFrame(packFrame({ mx: 3, mz: Number.NaN, turbo: false, a: false, b: false, sw: false }));
    expect(back.mx).toBe(1);
    expect(back.mz).toBe(0);
  });

  it('copies a frame without sharing it', () => {
    const a: InputFrame = { mx: 0.2, mz: 0.1, turbo: true, a: true, b: false, sw: true };
    const b = copyFrame(a, emptyFrame());
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
  });
});
