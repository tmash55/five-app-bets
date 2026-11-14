/**
 * The brains of the on-screen game pad, kept free of React so it can be
 * tested: fingers and keys go in, stick and button states come out.
 *
 * A thumb can rest on TURBO and slide up onto SHOOT or PASS: turbo stays on
 * for as long as that finger is down.
 */

import type { PadInput } from '@/game/sim/types';
import { pad, size } from '@/theme/tokens';

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
  /**
   * One player's part of a shared screen (two-player games): only touches that start inside it belong to this pad,
   * and the stick stays inside it. Left out, the pad has the whole screen.
   */
  region?: { left: number; top: number; right: number; bottom: number };
  /** where the stick's side ends and the buttons' side starts, across; left out, the middle of the screen */
  split?: number;
  /** the whole pad drawn smaller than the one-player pad (two players on a phone): 1 or less; left out, 1 */
  scale?: number;
}

/** Which keys play which part of the pad (web). */
export interface KeyMap {
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  a: readonly string[];
  b: readonly string[];
  turbo: readonly string[];
  sw: readonly string[];
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

/** a two-player cluster reaches in at most this share of the screen's width from its end */
const DUO_REACH = 0.38;
/** and is never drawn smaller than this share of the one-player pad */
const DUO_SCALE_MIN = 0.72;
/** how far above the floor a touch still belongs to a cluster, in pad units: a little above its highest button */
const DUO_REGION_UP = 240;

/** stick travel that counts as "not pushed" */
export const DEAD = 0.14;
/** how far past its edge a button still counts as hit */
const REACH = 1.28;
/** a first touch that misses every button still presses SHOOT or PASS if it lands this close (in button radii) */
const NEAR_MISS = 2.1;

/** one person on the keyboard: arrows or WASD to move */
export const PAD_KEYMAP: KeyMap = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  a: ['Space', 'KeyJ'],
  b: ['KeyK'],
  turbo: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  sw: ['KeyQ', 'KeyE'],
};

/** two people sharing a keyboard: P1 on the left of it, P2 on the right */
export const DUO_KEYMAPS: readonly [KeyMap, KeyMap] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyF'], b: ['KeyG'], turbo: ['ShiftLeft'], sw: ['KeyQ'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Slash'], b: ['Period'], turbo: ['ShiftRight'], sw: ['Comma'] },
];

function keysOf(map: KeyMap): string[] {
  return [...map.up, ...map.down, ...map.left, ...map.right, ...map.a, ...map.b, ...map.turbo, ...map.sw];
}

export const PAD_KEYS: readonly string[] = keysOf(PAD_KEYMAP);

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
  const u = pad.unit;
  // centres measured from the bottom corner on the button side: a triangle the thumb can roll around
  const fromCorner: [ButtonId, number, number, number][] = [
    ['turbo', 98 * u, 26 * u, pad.buttonSmall / 2 + 3 * u],
    ['a', 38 * u, 114 * u, pad.button / 2],
    ['b', 150 * u, 108 * u, pad.buttonMid / 2],
    ['sw', 244 * u, 24 * u, pad.buttonSmall / 2 - 4 * u],
  ];
  const floor = Math.max(bottom, 6 * u) + edge;
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
  const restX = lefty ? width - stickInset - pad.stick / 2 - 26 * u : stickInset + pad.stick / 2 + 26 * u;
  const restY = height - floor - pad.stick / 2 - 8 * u;
  return { width, height, lefty, spots, restX, restY };
}

/**
 * One person's controls in a two-player game: a compact cluster at their end of the screen, P1 (`side` 0) at the
 * left and P2 (`side` 1) mirrored at the right. The stick sits at the outer edge, the buttons on the inner side of
 * it, and only touches that start in the cluster's region count. `left`, `right` and `bottom` are the safe-area insets.
 */
export function duoLayout(width: number, height: number, left: number, right: number, bottom: number, side: 0 | 1): PadLayout {
  const edge = pad.inset;
  const outer = Math.max((side === 0 ? left : right) * 0.55, edge * 0.4) + edge;
  // the two clusters leave the middle of the screen to the game: on a phone that means a smaller pad than one person gets
  const k = Math.max(DUO_SCALE_MIN, Math.min(1, (width * DUO_REACH - outer) / pad.cluster));
  const u = pad.unit * k;
  const floor = Math.max(bottom, 6 * u) + edge;
  const stick = pad.stick * k;
  // from the outer edge: the stick, then the buttons out to the cluster's inner edge
  const inner = outer + pad.cluster * k;
  // where a point measured from the outer edge lands on the screen
  const at = (fromOuter: number) => (side === 0 ? fromOuter : width - fromOuter);
  // centres measured back from the inner edge and up from the floor
  const fromInner: [ButtonId, number, number, number][] = [
    ['a', 50 * u, 112 * u, (pad.button / 2) * k],
    ['b', 132 * u, 150 * u, (pad.buttonMid / 2) * k],
    ['turbo', 118 * u, 40 * u, (pad.buttonSmall / 2) * k + 3 * u],
    ['sw', 36 * u, 22 * u, (pad.buttonSmall / 2) * k - 4 * u],
  ];
  // never smaller than a comfortable tap, however small the screen
  const spots = fromInner.map(([id, dx, dy, r]) => ({ id, x: at(inner - dx), y: height - floor - dy, r: Math.max(r, size.tap / 2) }));
  const restX = at(outer + stick / 2 + 8 * u);
  const restY = height - floor - stick / 2 - 8 * u;
  const reach = at(inner + 12 * u);
  const top = height - floor - DUO_REGION_UP * u;
  const region = side === 0 ? { left: 0, top, right: reach, bottom: height } : { left: reach, top, right: width, bottom: height };
  return { width, height, lefty: side === 1, spots, restX, restY, region, split: at(outer + stick + 16 * u), scale: k };
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
  private readonly keymap: KeyMap;
  private readonly keyCodes: readonly string[];

  constructor(keymap: KeyMap = PAD_KEYMAP) {
    this.keymap = keymap;
    this.keyCodes = keymap === PAD_KEYMAP ? PAD_KEYS : keysOf(keymap);
  }

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

  /** The closest spot to (x, y) where the whole stick still fits on the screen (or in this pad's region). */
  private onScreen(x: number, y: number): [number, number] {
    const { width, height, region } = this.layout;
    const m = (pad.stick / 2 + 6 * pad.unit) * (this.layout.scale ?? 1);
    const l = region ? region.left : 0;
    const r = region ? region.right : width;
    const t = region ? region.top : 0;
    const b = region ? region.bottom : height;
    return [Math.max(l + m, Math.min(r - m, x)), Math.max(t + m, Math.min(b - m, y))];
  }

  /** This touch belongs to this pad: anywhere without a region, inside it with one. */
  private mine(t: PadTouch): boolean {
    const g = this.layout.region;
    return !g || (t.x >= g.left && t.x <= g.right && t.y >= g.top && t.y <= g.bottom);
  }

  private moveStick(tr: Tracked, x: number, y: number): void {
    const R = (pad.stick / 2) * (this.layout.scale ?? 1);
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
    const split = this.layout.split ?? width * 0.5;
    for (const t of touches) {
      // on a shared screen a touch that starts outside this pad's part is the other person's
      if (!this.mine(t)) continue;
      const stickSide = lefty ? t.x > split : t.x < split;
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
    if (!this.keyCodes.includes(code)) return false;
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
      const k = this.keymap;
      const any = (codes: readonly string[]) => codes.some((c) => keys.has(c));
      const kx = (any(k.right) ? 1 : 0) - (any(k.left) ? 1 : 0);
      const kz = (any(k.down) ? 1 : 0) - (any(k.up) ? 1 : 0);
      if (kx !== 0 || kz !== 0) {
        const l = Math.hypot(kx, kz);
        mx = kx / l;
        mz = kz / l;
      }
      a = a || any(k.a);
      b = b || any(k.b);
      turbo = turbo || any(k.turbo);
      sw = sw || any(k.sw);
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
