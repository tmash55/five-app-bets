/**
 * The brains of the on-screen game pad, kept free of React so it can be
 * tested: fingers and keys go in, stick and button states come out.
 *
 * A thumb can rest on TURBO and slide up onto SHOOT or PASS: turbo stays on
 * for as long as that finger is down.
 */

import type { PadInput } from '@/game/sim/types';
import { pad } from '@/theme/tokens';

export type ButtonId = 'a' | 'b' | 'turbo' | 'sw';

export interface ButtonSpot {
  id: ButtonId;
  x: number;
  y: number;
  r: number;
}

export interface PadLayout {
  width: number;
  height: number;
  lefty: boolean;
  spots: ButtonSpot[];
  /** where the stick sits when no thumb is on it */
  restX: number;
  restY: number;
}

export interface PadTouch {
  id: number | string;
  x: number;
  y: number;
}

/** What the pad looks like right now. The React side turns these calls into animation. */
export interface PadView {
  base: (x: number, y: number, settle: boolean) => void;
  knob: (dx: number, dy: number, settle: boolean) => void;
  live: (on: boolean) => void;
  pressed: (a: boolean, b: boolean, turbo: boolean, sw: boolean) => void;
}

/** stick travel that counts as "not pushed" */
export const DEAD = 0.14;
/** how far past its edge a button still counts as hit */
const REACH = 1.28;
/** a first touch that misses every button still presses SHOOT or PASS if it lands this close (in button radii) */
const NEAR_MISS = 2.1;

export const PAD_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'];

interface Tracked {
  kind: 'stick' | 'buttons';
  /** stick: where the base sits */
  ox: number;
  oy: number;
  /** buttons: the one under the finger now */
  on: ButtonId | null;
  /** this finger has touched TURBO and keeps it lit */
  turbo: boolean;
}

/** Where everything sits for a screen of this size. `left`, `right` and `bottom` are the safe-area insets. */
export function padLayout(width: number, height: number, left: number, right: number, bottom: number, lefty: boolean): PadLayout {
  const edge = pad.inset;
  // centres measured from the bottom corner on the button side: a triangle the thumb can roll around
  const fromCorner: [ButtonId, number, number, number][] = [
    ['turbo', 98, 26, pad.buttonSmall / 2 + 3],
    ['a', 38, 114, pad.button / 2],
    ['b', 150, 108, pad.buttonMid / 2],
    ['sw', 244, 24, pad.buttonSmall / 2 - 4],
  ];
  const floor = Math.max(bottom, 6) + edge;
  // the side inset only has to clear the rounded corner, so a thumb never has to stretch for the buttons
  const side = (v: number) => Math.max(v * 0.55, edge * 0.4) + edge;
  const inset = side(lefty ? left : right);
  const spots = fromCorner.map(([id, dx, dy, r]) => ({
    id,
    x: lefty ? inset + dx : width - inset - dx,
    y: height - floor - dy,
    r,
  }));
  const stickInset = side(lefty ? right : left);
  const restX = lefty ? width - stickInset - pad.stick / 2 - 26 : stickInset + pad.stick / 2 + 26;
  const restY = height - floor - pad.stick / 2 - 8;
  return { width, height, lefty, spots, restX, restY };
}

export class PadModel {
  private layout: PadLayout = padLayout(800, 400, 0, 0, 0, false);
  private offense = false;
  private enabled = true;
  private out: PadInput | null = null;
  private view: PadView | null = null;
  private readonly touches = new Map<number | string, Tracked>();
  private readonly keys = new Set<string>();
  private stickX = 0;
  private stickZ = 0;

  /** Point the pad at the match it drives and the view that draws it. */
  connect(out: PadInput | null, view: PadView | null): void {
    this.out = out;
    this.view = view;
    this.publish();
  }

  setLayout(layout: PadLayout): void {
    this.layout = layout;
    let stickDown = false;
    for (const t of this.touches.values()) if (t.kind === 'stick') stickDown = true;
    if (!stickDown) this.view?.base(layout.restX, layout.restY, false);
  }

  /** With the ball the fourth button (switch player) is hidden and cannot be hit. */
  setOffense(offense: boolean): void {
    this.offense = offense;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  /** Let go of everything. */
  reset(): void {
    this.touches.clear();
    this.keys.clear();
    this.stickX = 0;
    this.stickZ = 0;
    this.view?.knob(0, 0, true);
    this.view?.live(false);
    this.view?.base(this.layout.restX, this.layout.restY, true);
    this.publish();
  }

  private hit(x: number, y: number, forgiving: boolean): ButtonId | null {
    let best: ButtonId | null = null;
    let bestD = Infinity;
    for (const s of this.layout.spots) {
      if (s.id === 'sw' && this.offense) continue;
      const d = Math.hypot(x - s.x, y - s.y) / (s.r * REACH);
      if (d <= 1 && d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    if (best === null && forgiving) {
      for (const s of this.layout.spots) {
        if (s.id !== 'a' && s.id !== 'b') continue;
        const d = Math.hypot(x - s.x, y - s.y) / (s.r * NEAR_MISS);
        if (d <= 1 && d < bestD) {
          bestD = d;
          best = s.id;
        }
      }
    }
    return best;
  }

  /** The closest spot to (x, y) where the whole stick still fits on the screen. */
  private onScreen(x: number, y: number): [number, number] {
    const { width, height } = this.layout;
    const m = pad.stick / 2 + 6;
    return [Math.max(m, Math.min(width - m, x)), Math.max(m, Math.min(height - m, y))];
  }

  private moveStick(tr: Tracked, x: number, y: number): void {
    const R = pad.stick / 2;
    let dx = x - tr.ox;
    let dy = y - tr.oy;
    let len = Math.hypot(dx, dy);
    if (len > R) {
      // drag the base along so a thumb that wanders never runs out of stick
      const pull = len - R;
      const [ox, oy] = this.onScreen(tr.ox + (dx / len) * pull, tr.oy + (dy / len) * pull);
      if (ox !== tr.ox || oy !== tr.oy) {
        tr.ox = ox;
        tr.oy = oy;
        this.view?.base(ox, oy, false);
      }
      dx = x - tr.ox;
      dy = y - tr.oy;
      len = Math.hypot(dx, dy);
      if (len > R) {
        // the base is against the edge of the screen: the knob stops at the rim
        dx *= R / len;
        dy *= R / len;
      }
    }
    this.view?.knob(dx, dy, false);
    const m = Math.min(1, Math.hypot(dx, dy) / R);
    if (m < DEAD) {
      this.stickX = 0;
      this.stickZ = 0;
    } else {
      const k = (m - DEAD) / (1 - DEAD) / (m * R);
      this.stickX = dx * k;
      this.stickZ = dy * k;
    }
  }

  start(touches: readonly PadTouch[]): void {
    if (!this.enabled) return;
    const { width, lefty } = this.layout;
    for (const t of touches) {
      const stickSide = lefty ? t.x > width * 0.5 : t.x < width * 0.5;
      if (stickSide) {
        let has = false;
        for (const tr of this.touches.values()) if (tr.kind === 'stick') has = true;
        if (has) continue;
        const [ox, oy] = this.onScreen(t.x, t.y);
        const tr: Tracked = { kind: 'stick', ox, oy, on: null, turbo: false };
        this.touches.set(t.id, tr);
        this.view?.base(tr.ox, tr.oy, false);
        this.view?.live(true);
        this.moveStick(tr, t.x, t.y);
      } else {
        const on = this.hit(t.x, t.y, true);
        this.touches.set(t.id, { kind: 'buttons', ox: t.x, oy: t.y, on, turbo: on === 'turbo' });
      }
    }
    this.publish();
  }

  move(touches: readonly PadTouch[]): void {
    if (!this.enabled) return;
    for (const t of touches) {
      const tr = this.touches.get(t.id);
      if (!tr) continue;
      if (tr.kind === 'stick') {
        this.moveStick(tr, t.x, t.y);
      } else {
        const on = this.hit(t.x, t.y, false);
        // keep the button until the finger is clearly on another one, so a wobble never drops a held shot
        if (on !== null && on !== tr.on) {
          tr.on = on;
          if (on === 'turbo') tr.turbo = true;
        }
      }
    }
    this.publish();
  }

  end(touches: readonly PadTouch[]): void {
    for (const t of touches) {
      const tr = this.touches.get(t.id);
      if (!tr) continue;
      this.touches.delete(t.id);
      if (tr.kind === 'stick') {
        this.stickX = 0;
        this.stickZ = 0;
        this.view?.knob(0, 0, true);
        this.view?.live(false);
        this.view?.base(this.layout.restX, this.layout.restY, true);
      }
    }
    this.publish();
  }

  /** A keyboard key went down or up (web). Returns true when the key belongs to the pad. */
  key(code: string, down: boolean): boolean {
    if (!PAD_KEYS.includes(code)) return false;
    if (down) {
      if (!this.enabled) return true;
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
    this.publish();
    return true;
  }

  /** Fold fingers and keys into the pad the simulation reads. */
  private publish(): void {
    let a = false;
    let b = false;
    let turbo = false;
    let sw = false;
    for (const tr of this.touches.values()) {
      if (tr.kind !== 'buttons') continue;
      if (tr.on === 'a') a = true;
      if (tr.on === 'b') b = true;
      if (tr.on === 'sw') sw = true;
      if (tr.turbo || tr.on === 'turbo') turbo = true;
    }
    let mx = this.stickX;
    let mz = this.stickZ;
    const keys = this.keys;
    if (keys.size > 0) {
      const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const kz = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      if (kx !== 0 || kz !== 0) {
        const l = Math.hypot(kx, kz);
        mx = kx / l;
        mz = kz / l;
      }
      a = a || keys.has('Space') || keys.has('KeyJ');
      b = b || keys.has('KeyK');
      turbo = turbo || keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyL');
      sw = sw || keys.has('KeyQ') || keys.has('KeyE');
    }
    const p = this.out;
    if (p) {
      p.mx = mx;
      p.mz = mz;
      p.a = a;
      p.b = b;
      p.turbo = turbo;
      p.sw = sw;
    }
    this.view?.pressed(a, b, turbo, sw);
  }
}
