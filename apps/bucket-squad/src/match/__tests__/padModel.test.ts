import type { PadInput } from '@/game/sim/types';
import { pad } from '@/theme/tokens';

import { DEAD, PAD_KEYS, PadModel, padLayout, type ButtonId, type PadLayout, type PadView } from '../padModel';

const W = 844;
const H = 390;

function newInput(): PadInput {
  return { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
}

function setup(lefty = false) {
  const layout = padLayout(W, H, 0, 0, 0, lefty);
  const out = newInput();
  const calls = { base: [] as [number, number, boolean][], knob: [] as [number, number, boolean][], live: [] as boolean[], pressed: [] as [boolean, boolean, boolean, boolean][] };
  const view: PadView = {
    base: (x, y, settle) => calls.base.push([x, y, settle]),
    knob: (dx, dy, settle) => calls.knob.push([dx, dy, settle]),
    live: (on) => calls.live.push(on),
    pressed: (a, b, turbo, sw) => calls.pressed.push([a, b, turbo, sw]),
  };
  const model = new PadModel();
  model.setLayout(layout);
  model.connect(out, view);
  const spot = (id: ButtonId) => {
    const s = layout.spots.find((x) => x.id === id);
    if (!s) throw new Error(id);
    return s;
  };
  const at = (id: ButtonId, finger: number | string = id) => ({ id: finger, x: spot(id).x, y: spot(id).y });
  return { layout, out, calls, model, spot, at };
}

const overlap = (layout: PadLayout) => {
  const pairs: string[] = [];
  layout.spots.forEach((a, i) => {
    layout.spots.slice(i + 1).forEach((b) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) pairs.push(`${a.id}/${b.id}`);
    });
  });
  return pairs;
};

describe('where the pad sits', () => {
  it('keeps every button on the screen without overlapping', () => {
    for (const [w, h] of [
      [667, 375],
      [844, 390],
      [932, 430],
      [1180, 820],
    ]) {
      for (const lefty of [false, true]) {
        const layout = padLayout(w, h, 0, 0, 0, lefty);
        expect(overlap(layout)).toEqual([]);
        for (const s of layout.spots) {
          expect(s.x - s.r).toBeGreaterThanOrEqual(0);
          expect(s.x + s.r).toBeLessThanOrEqual(w);
          expect(s.y - s.r).toBeGreaterThanOrEqual(0);
          expect(s.y + s.r).toBeLessThanOrEqual(h);
          // buttons live on their own half, away from the stick
          expect(lefty ? s.x < w / 2 : s.x > w / 2).toBe(true);
        }
        expect(lefty ? layout.restX > w / 2 : layout.restX < w / 2).toBe(true);
        expect(layout.restY + pad.stick / 2).toBeLessThanOrEqual(h);
      }
    }
  });

  it('mirrors for left-handed players', () => {
    const right = padLayout(W, H, 0, 0, 0, false);
    const left = padLayout(W, H, 0, 0, 0, true);
    right.spots.forEach((s, i) => {
      expect(left.spots[i].id).toBe(s.id);
      expect(left.spots[i].x).toBeCloseTo(W - s.x, 6);
      expect(left.spots[i].y).toBe(s.y);
    });
    expect(left.restX).toBeCloseTo(W - right.restX, 6);
  });

  it('moves in from a notch and up from the home bar', () => {
    const plain = padLayout(W, H, 0, 0, 0, false);
    const notched = padLayout(W, H, 47, 47, 21, false);
    notched.spots.forEach((s, i) => {
      expect(s.x).toBeLessThan(plain.spots[i].x);
      expect(s.y).toBeLessThan(plain.spots[i].y);
    });
    expect(notched.restX).toBeGreaterThan(plain.restX);
    expect(notched.restY).toBeLessThan(plain.restY);
  });

  it('makes SHOOT the biggest button', () => {
    const { spot } = setup();
    expect(spot('a').r).toBeGreaterThan(spot('b').r);
    expect(spot('b').r).toBeGreaterThan(spot('turbo').r);
    expect(spot('turbo').r).toBeGreaterThan(spot('sw').r);
  });
});

describe('the stick', () => {
  it('appears under the thumb and reads nothing until it is pushed', () => {
    const { model, out, calls } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    expect(out).toMatchObject({ mx: 0, mz: 0 });
    expect(calls.base.at(-1)).toEqual([150, 250, false]);
    expect(calls.live.at(-1)).toBe(true);
    // a wobble inside the dead zone is still nothing
    model.move([{ id: 1, x: 150 + (pad.stick / 2) * DEAD * 0.9, y: 250 }]);
    expect(out).toMatchObject({ mx: 0, mz: 0 });
  });

  it('pushes fully at the rim and in the right direction', () => {
    const { model, out } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 150 + pad.stick / 2, y: 250 }]);
    expect(out.mx).toBeCloseTo(1, 6);
    expect(out.mz).toBeCloseTo(0, 6);
    model.move([{ id: 1, x: 150, y: 250 - pad.stick / 2 }]);
    expect(out.mx).toBeCloseTo(0, 6);
    expect(out.mz).toBeCloseTo(-1, 6);
  });

  it('grows smoothly from the dead zone to full', () => {
    const { model, out } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    let last = 0;
    for (let step = 1; step <= 20; step++) {
      model.move([{ id: 1, x: 150 + (pad.stick / 2) * (step / 20), y: 250 }]);
      expect(out.mx).toBeGreaterThanOrEqual(last);
      expect(out.mx).toBeLessThanOrEqual(1.000001);
      last = out.mx;
    }
    expect(last).toBeCloseTo(1, 6);
  });

  it('follows a thumb that wanders past the rim', () => {
    const { model, out, calls } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 150 + pad.stick, y: 250 }]);
    expect(out.mx).toBeCloseTo(1, 6);
    // the base was dragged along, so coming back a little already eases off
    expect(calls.base.at(-1)?.[0]).toBeCloseTo(150 + pad.stick / 2, 6);
    model.move([{ id: 1, x: 150 + pad.stick * 0.75, y: 250 }]);
    expect(out.mx).toBeLessThan(1);
    expect(out.mx).toBeGreaterThan(0);
    model.move([{ id: 1, x: 150, y: 250 }]);
    expect(out.mx).toBeCloseTo(-1, 6);
  });

  it('never reports more than a full push on a diagonal', () => {
    const { model, out } = setup();
    model.start([{ id: 1, x: 200, y: 250 }]);
    model.move([{ id: 1, x: 200 + 120, y: 250 - 120 }]);
    expect(Math.hypot(out.mx, out.mz)).toBeCloseTo(1, 6);
    expect(out.mx).toBeCloseTo(Math.SQRT1_2, 6);
    expect(out.mz).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('lets go and settles back when the thumb lifts', () => {
    const { model, out, calls, layout } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 210, y: 250 }]);
    model.end([{ id: 1, x: 210, y: 250 }]);
    expect(out).toMatchObject({ mx: 0, mz: 0 });
    expect(calls.knob.at(-1)).toEqual([0, 0, true]);
    expect(calls.live.at(-1)).toBe(false);
    expect(calls.base.at(-1)).toEqual([layout.restX, layout.restY, true]);
  });

  it('ignores a second finger on the stick side', () => {
    const { model, out } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 150 + pad.stick / 2, y: 250 }]);
    model.start([{ id: 2, x: 60, y: 100 }]);
    model.move([{ id: 2, x: 0, y: 100 }]);
    expect(out.mx).toBeCloseTo(1, 6);
    model.end([{ id: 2, x: 0, y: 100 }]);
    expect(out.mx).toBeCloseTo(1, 6);
  });

  it('stays on the screen when the thumb lands in a corner', () => {
    const { model, out, calls } = setup();
    model.start([{ id: 1, x: 2, y: H - 2 }]);
    model.move([{ id: 1, x: 0, y: H }]);
    const [x, y] = calls.base.at(-1) as [number, number, boolean];
    expect(x - pad.stick / 2).toBeGreaterThanOrEqual(0);
    expect(y + pad.stick / 2).toBeLessThanOrEqual(H);
    // the knob stops at the rim and the push is full, toward the corner
    const [kx, ky] = calls.knob.at(-1) as [number, number, boolean];
    expect(Math.hypot(kx, ky)).toBeCloseTo(pad.stick / 2, 6);
    expect(Math.hypot(out.mx, out.mz)).toBeCloseTo(1, 6);
    expect(out.mx).toBeLessThan(0);
    expect(out.mz).toBeGreaterThan(0);
  });

  it('sits on the right for left-handed players', () => {
    const { model, out } = setup(true);
    model.start([{ id: 1, x: W - 150, y: 250 }]);
    model.move([{ id: 1, x: W - 150 - pad.stick / 2, y: 250 }]);
    expect(out.mx).toBeCloseTo(-1, 6);
    expect(out.a).toBe(false);
  });
});

describe('the buttons', () => {
  it('presses the button under the finger and releases it', () => {
    for (const id of ['a', 'b', 'turbo', 'sw'] as const) {
      const { model, out, at } = setup();
      model.start([at(id)]);
      expect(out[id]).toBe(true);
      expect(Object.values(out).filter((v) => v === true)).toHaveLength(1);
      model.end([at(id)]);
      expect(out[id]).toBe(false);
    }
  });

  it('tells the view what is lit', () => {
    const { model, calls, at } = setup();
    model.start([at('b')]);
    expect(calls.pressed.at(-1)).toEqual([false, true, false, false]);
    model.end([at('b')]);
    expect(calls.pressed.at(-1)).toEqual([false, false, false, false]);
  });

  it('holds two buttons with two fingers', () => {
    const { model, out, at } = setup();
    model.start([at('turbo')]);
    model.start([at('a')]);
    expect(out).toMatchObject({ a: true, turbo: true });
    model.end([at('a')]);
    expect(out).toMatchObject({ a: false, turbo: true });
  });

  it('keeps turbo on while one thumb slides up to SHOOT', () => {
    const { model, out, spot } = setup();
    model.start([{ id: 9, x: spot('turbo').x, y: spot('turbo').y }]);
    expect(out).toMatchObject({ turbo: true, a: false });
    model.move([{ id: 9, x: spot('a').x, y: spot('a').y }]);
    expect(out).toMatchObject({ turbo: true, a: true });
    model.move([{ id: 9, x: spot('b').x, y: spot('b').y }]);
    expect(out).toMatchObject({ turbo: true, a: false, b: true });
    model.end([{ id: 9, x: spot('b').x, y: spot('b').y }]);
    expect(out).toMatchObject({ turbo: false, a: false, b: false });
  });

  it('does not light turbo for a thumb that started on SHOOT and slid down', () => {
    const { model, out, spot } = setup();
    model.start([{ id: 9, x: spot('a').x, y: spot('a').y }]);
    model.move([{ id: 9, x: spot('turbo').x, y: spot('turbo').y }]);
    // sliding onto TURBO does turn it on, and it then stays on
    expect(out).toMatchObject({ a: false, turbo: true });
    model.move([{ id: 9, x: spot('a').x, y: spot('a').y }]);
    expect(out).toMatchObject({ a: true, turbo: true });
  });

  it('keeps a held shot when the finger wobbles off the button', () => {
    const { model, out, spot } = setup();
    model.start([{ id: 9, x: spot('a').x, y: spot('a').y }]);
    model.move([{ id: 9, x: spot('a').x, y: spot('a').y - spot('a').r * 3 }]);
    expect(out.a).toBe(true);
    model.end([{ id: 9, x: 0, y: 0 }]);
    expect(out.a).toBe(false);
  });

  it('forgives a first tap that just misses SHOOT or PASS', () => {
    const { model, out, spot } = setup();
    const a = spot('a');
    // straight up from SHOOT, well outside the button itself
    model.start([{ id: 1, x: a.x, y: a.y - a.r * 1.7 }]);
    expect(out.a).toBe(true);
    model.end([{ id: 1, x: 0, y: 0 }]);
    // but a tap far away from everything presses nothing
    model.start([{ id: 2, x: W * 0.55, y: 40 }]);
    expect(out).toEqual(newInput());
  });

  it('hides the switch button while you have the ball', () => {
    const { model, out, at } = setup();
    model.setOffense(true);
    model.start([at('sw')]);
    expect(out.sw).toBe(false);
    model.end([at('sw')]);
    model.setOffense(false);
    model.start([at('sw')]);
    expect(out.sw).toBe(true);
  });

  it('sits on the left for left-handed players', () => {
    const { model, out, at, spot } = setup(true);
    expect(spot('a').x).toBeLessThan(W / 2);
    model.start([at('a')]);
    expect(out.a).toBe(true);
  });

  it('plays stick and buttons together', () => {
    const { model, out, at } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 150, y: 250 + pad.stick / 2 }]);
    model.start([at('a', 2)]);
    expect(out.mz).toBeCloseTo(1, 6);
    expect(out.a).toBe(true);
    model.end([{ id: 1, x: 0, y: 0 }]);
    expect(out).toMatchObject({ mx: 0, mz: 0, a: true });
  });
});

describe('the keyboard', () => {
  it('moves with arrows or WASD and never faster on a diagonal', () => {
    const { model, out } = setup();
    expect(model.key('ArrowRight', true)).toBe(true);
    expect(out).toMatchObject({ mx: 1, mz: 0 });
    model.key('KeyW', true);
    expect(out.mx).toBeCloseTo(Math.SQRT1_2, 6);
    expect(out.mz).toBeCloseTo(-Math.SQRT1_2, 6);
    model.key('ArrowRight', false);
    expect(out).toMatchObject({ mx: 0, mz: -1 });
    model.key('KeyW', false);
    expect(out).toMatchObject({ mx: 0, mz: 0 });
  });

  it('cancels out opposite keys', () => {
    const { model, out } = setup();
    model.key('ArrowLeft', true);
    model.key('ArrowRight', true);
    expect(out.mx).toBe(0);
  });

  it('has a key for every button', () => {
    const cases: [string, ButtonId][] = [
      ['Space', 'a'],
      ['KeyJ', 'a'],
      ['KeyK', 'b'],
      ['KeyL', 'turbo'],
      ['ShiftLeft', 'turbo'],
      ['ShiftRight', 'turbo'],
      ['KeyQ', 'sw'],
      ['KeyE', 'sw'],
    ];
    for (const [code, id] of cases) {
      const { model, out } = setup();
      expect(PAD_KEYS).toContain(code);
      model.key(code, true);
      expect(out[id]).toBe(true);
      model.key(code, false);
      expect(out[id]).toBe(false);
    }
  });

  it('leaves other keys alone', () => {
    const { model, out } = setup();
    expect(model.key('Escape', true)).toBe(false);
    expect(model.key('KeyP', true)).toBe(false);
    expect(out).toEqual(newInput());
  });
});

describe('pausing', () => {
  it('lets go of everything when switched off and ignores new presses', () => {
    const { model, out, at } = setup();
    model.start([{ id: 1, x: 150, y: 250 }]);
    model.move([{ id: 1, x: 150 + pad.stick / 2, y: 250 }]);
    model.start([at('a', 2)]);
    model.key('KeyL', true);
    model.setEnabled(false);
    expect(out).toEqual(newInput());
    model.start([at('b', 3)]);
    model.move([{ id: 1, x: 150 + pad.stick / 2, y: 250 }]);
    // the key is still claimed (so the page does not scroll) but does nothing
    expect(model.key('Space', true)).toBe(true);
    expect(out).toEqual(newInput());
    model.setEnabled(true);
    model.start([at('b', 4)]);
    expect(out.b).toBe(true);
  });

  it('forgets fingers that were down before the pause', () => {
    const { model, out, at } = setup();
    model.start([at('turbo', 5)]);
    model.setEnabled(false);
    model.setEnabled(true);
    model.move([{ ...at('a', 5) }]);
    model.end([at('a', 5)]);
    expect(out).toEqual(newInput());
  });

  it('works with nothing connected', () => {
    const model = new PadModel();
    expect(() => {
      model.start([{ id: 1, x: 10, y: 10 }]);
      model.move([{ id: 1, x: 40, y: 40 }]);
      model.end([{ id: 1, x: 40, y: 40 }]);
      model.key('Space', true);
      model.reset();
    }).not.toThrow();
  });

  it('writes the current state to a newly connected match', () => {
    const { model, at } = setup();
    model.start([at('a')]);
    const next = newInput();
    model.connect(next, null);
    expect(next.a).toBe(true);
  });
});
