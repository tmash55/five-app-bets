/** The two-player pad: a cluster at each end, each taking only the fingers that start in it. */

import type { PadInput } from '@/game/sim/types';
import { pad, size } from '@/theme/tokens';

import { DUO_KEYMAPS, PAD_KEYS, PadModel, duoLayout, type ButtonId, type PadLayout } from '../padModel';

/** an iPad on its side, a phone on its side with its island and home bar, and a small phone */
const SCREENS: [string, number, number, number, number, number][] = [
  ['iPad', 1180, 820, 0, 0, 20],
  ['phone', 874, 402, 62, 62, 21],
  ['small phone', 667, 375, 0, 0, 0],
];

function newInput(): PadInput {
  return { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
}

function pair(w: number, h: number, l = 0, r = 0, b = 0) {
  const layouts = [duoLayout(w, h, l, r, b, 0), duoLayout(w, h, l, r, b, 1)] as const;
  const outs = [newInput(), newInput()] as const;
  const models = [new PadModel(DUO_KEYMAPS[0]), new PadModel(DUO_KEYMAPS[1])] as const;
  models.forEach((m, i) => {
    m.setLayout(layouts[i]);
    m.connect(outs[i], null);
  });
  const spot = (side: 0 | 1, id: ButtonId) => layouts[side].spots.find((s) => s.id === id)!;
  return { layouts, outs, models, spot };
}

const overlaps = (layout: PadLayout) => {
  const out: string[] = [];
  layout.spots.forEach((a, i) => {
    layout.spots.slice(i + 1).forEach((b) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) out.push(`${a.id}/${b.id}`);
    });
  });
  return out;
};

describe('where the two clusters sit', () => {
  for (const [name, w, h, l, r, b] of SCREENS) {
    it(`fits both on ${name} (${w}x${h}) without touching`, () => {
      const { layouts } = pair(w, h, l, r, b);
      const [p1, p2] = layouts;
      for (const lay of layouts) {
        expect(overlaps(lay)).toEqual([]);
        for (const s of lay.spots) {
          expect(s.x - s.r).toBeGreaterThanOrEqual(0);
          expect(s.x + s.r).toBeLessThanOrEqual(w);
          expect(s.y + s.r).toBeLessThanOrEqual(h);
          // still a comfortable target for a thumb
          expect(s.r * 2).toBeGreaterThanOrEqual(size.tap * 0.95);
        }
        // the stick at rest clears the buttons
        const R = (pad.stick / 2) * (lay.scale ?? 1);
        for (const s of lay.spots) expect(Math.hypot(s.x - lay.restX, s.y - lay.restY)).toBeGreaterThan(R + s.r * 0.6);
      }
      // P1 at the left end, P2 at the right, with the middle of the screen left to the game
      expect(Math.max(...p1.spots.map((s) => s.x + s.r))).toBeLessThan(w * 0.42);
      expect(Math.min(...p2.spots.map((s) => s.x - s.r))).toBeGreaterThan(w * 0.58);
      expect(p1.restX).toBeLessThan(Math.min(...p1.spots.map((s) => s.x)));
      expect(p2.restX).toBeGreaterThan(Math.max(...p2.spots.map((s) => s.x)));
      // mirrored
      for (const id of ['a', 'b', 'turbo', 'sw'] as const) {
        const s1 = p1.spots.find((s) => s.id === id)!;
        const s2 = p2.spots.find((s) => s.id === id)!;
        expect(s1.y).toBeCloseTo(s2.y, 6);
        expect(s1.r).toBeCloseTo(s2.r, 6);
      }
      // the two regions never share a point
      expect(p1.region!.right).toBeLessThan(p2.region!.left);
    });
  }

  it('is the full-size pad on an iPad and a little smaller on a phone', () => {
    expect(duoLayout(1180, 820, 0, 0, 20, 0).scale).toBe(1);
    const phone = duoLayout(874, 402, 62, 62, 21, 0).scale!;
    expect(phone).toBeLessThan(1);
    expect(phone).toBeGreaterThanOrEqual(0.72);
  });
});

describe('two people at once', () => {
  it('hands each finger to the cluster it started in', () => {
    const { models, outs, layouts, spot } = pair(1180, 820);
    const touches = [
      { id: 1, x: layouts[0].restX + 10, y: layouts[0].restY },
      { id: 2, x: layouts[1].restX - 10, y: layouts[1].restY },
      { id: 3, x: spot(1, 'b').x, y: spot(1, 'b').y },
    ];
    // every cluster sees every changed finger, as the screen hands them over
    for (const m of models) m.start(touches);
    expect(outs[0].b).toBe(false);
    expect(outs[1].b).toBe(true);
    const moved = [
      { id: 1, x: layouts[0].restX + 80, y: layouts[0].restY },
      { id: 2, x: layouts[1].restX - 10, y: layouts[1].restY + 80 },
    ];
    for (const m of models) m.move(moved);
    expect(outs[0].mx).toBeGreaterThan(0.9);
    expect(Math.abs(outs[0].mz)).toBeLessThan(0.05);
    expect(outs[1].mz).toBeGreaterThan(0.9);
    expect(Math.abs(outs[1].mx)).toBeLessThan(0.05);
    for (const m of models) m.end([touches[2]]);
    expect(outs[1].b).toBe(false);
    expect(outs[1].mz).toBeGreaterThan(0.9);
  });

  it('ignores a finger that starts outside its cluster, even if it slides in', () => {
    const { models, outs, spot } = pair(1180, 820);
    const middle = { id: 7, x: 590, y: 700 };
    for (const m of models) m.start([middle]);
    for (const m of models) m.move([{ id: 7, x: spot(0, 'a').x, y: spot(0, 'a').y }]);
    expect(outs[0]).toEqual(newInput());
    expect(outs[1]).toEqual(newInput());
  });

  it('keeps a finger with its own cluster when it wanders across the screen', () => {
    const { models, outs, spot } = pair(1180, 820);
    const a1 = { id: 4, x: spot(0, 'a').x, y: spot(0, 'a').y };
    for (const m of models) m.start([a1]);
    expect(outs[0].a).toBe(true);
    // a wild slide over the other person's buttons does not press them
    for (const m of models) m.move([{ id: 4, x: spot(1, 'a').x, y: spot(1, 'a').y }]);
    expect(outs[1].a).toBe(false);
    expect(outs[0].a).toBe(true);
  });

  it('gives each person their own keys on a shared keyboard', () => {
    const { models, outs } = pair(1180, 820);
    expect(models[0].key('KeyF', true)).toBe(true);
    expect(models[1].key('KeyF', true)).toBe(false);
    expect(outs[0].a).toBe(true);
    expect(outs[1].a).toBe(false);
    models[1].key('ArrowLeft', true);
    models[0].key('ArrowLeft', true);
    expect(outs[1].mx).toBe(-1);
    expect(outs[0].mx).toBe(0);
    models[1].key('Period', true);
    expect(outs[1].b).toBe(true);
    // no key belongs to both
    const shared = DUO_KEYMAPS.map((k) => Object.values(k).flat());
    expect(shared[0].filter((c) => shared[1].includes(c))).toEqual([]);
    // and the one-player keys are as they were
    expect(PAD_KEYS).toEqual(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space', 'KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight', 'KeyL', 'KeyQ', 'KeyE']);
  });
});
