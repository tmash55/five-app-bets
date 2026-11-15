/**
 * How much the 3D views draw, chosen for the device and adapted while they play.
 *
 * A ladder of levels runs from the full look (level 0, exactly as the game always drew) down to the lightest. Going
 * down the ladder first draws fewer pixels (the view is drawn smaller and stretched back over the screen), then turns
 * off the costly extras (edge smoothing, the floor's grain and hot-streak shine, half the sparkles, the crowd's bob),
 * and last draws every other display frame: an even 30 frames a second looks smoother than one jumping between 40
 * and 55. The game itself never notices: the simulation keeps its fixed 60 Hz steps whatever the drawing does.
 *
 * A `Governor` per view watches the frames. A second of slow frames steps down one level at once. Stepping up waits
 * for several seconds of frames with plenty of time to spare, and a level that was tried and failed waits twice as
 * long before it is tried again, so the picture never flickers between two levels.
 */

import { useSyncExternalStore } from 'react';
import { Platform, PixelRatio, Dimensions } from 'react-native';

export interface Level {
  /** pixels per side, against the view's own most pixels per point (1 = as today) */
  scale: number;
  /** edge smoothing (multisampling; on a native GL view it changes along with the size) */
  smooth: boolean;
  /** the costly extras: floor grain and hot-streak shine, every sparkle, the crowd's bob */
  extras: boolean;
  /** draw every other display frame (30 a second on a 60 Hz screen) */
  half: boolean;
}

export const LEVELS: readonly Level[] = [
  { scale: 1, smooth: true, extras: true, half: false },
  { scale: 0.85, smooth: true, extras: true, half: false },
  { scale: 0.72, smooth: true, extras: true, half: false },
  { scale: 0.72, smooth: true, extras: false, half: false },
  { scale: 0.6, smooth: false, extras: false, half: false },
  { scale: 0.6, smooth: false, extras: false, half: true },
];

export const TOP = 0;
export const BOTTOM = LEVELS.length - 1;

/** The Settings choice. Auto adapts over the whole ladder; Pretty keeps the full look; Fast keeps the lightest. */
export type GraphicsMode = 'auto' | 'fast' | 'pretty';

export const GRAPHICS_MODES: readonly GraphicsMode[] = ['auto', 'fast', 'pretty'];

/** the levels each choice may use, best first */
export function rangeFor(mode: GraphicsMode): { best: number; worst: number } {
  if (mode === 'pretty') return { best: TOP, worst: TOP };
  if (mode === 'fast') return { best: 4, worst: BOTTOM };
  return { best: TOP, worst: BOTTOM };
}

export interface DeviceFacts {
  os: string;
  isPad: boolean;
  /** major version of the operating system (iOS / iPadOS), 0 when not known */
  osMajor: number;
  /** pixels a full-screen 3D view at 2 pixels a point would draw */
  pixels: number;
}

/** What is known about this device without asking anything else. */
export function deviceFacts(): DeviceFacts {
  const { width, height } = Dimensions.get('window');
  const k = Math.min(2, PixelRatio.get());
  const v = Platform.Version;
  const osMajor = Platform.OS === 'ios' ? parseInt(String(v), 10) || 0 : 0;
  const isPad = Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true;
  return { os: Platform.OS, isPad, osMajor, pixels: Math.round(width * k * height * k) };
}

/** A big screen: a 3D view over it at 2 pixels a point draws more than an iPhone's match does (about 2 million). */
const BIG = 2.4e6;

/**
 * The level to start at before anything is measured. iPads are where it matters: their screens are big and their
 * chips can be years older than any phone that runs the same app. The newest iPadOS an iPad can take says roughly
 * how old its chip is (iPadOS 16 is as far as the A9 iPads go, 17 the A10 ones, 18 the A10X and A11 ones), so an
 * iPad that has not moved past those starts lower. Everything else starts at the top and steps down if it must.
 */
export function startLevel(f: DeviceFacts): number {
  if (!f.isPad || f.pixels < BIG || f.osMajor <= 0) return TOP;
  if (f.osMajor <= 16) return 3;
  if (f.osMajor === 17) return 2;
  if (f.osMajor === 18) return 1;
  return TOP;
}

/** a 60 Hz frame, ms */
export const FRAME_MS = 1000 / 60;

export const TUNING = {
  /** frames in one look at how things are going */
  window: 60,
  /** frames right after a change of level that are not counted (the view is being resized) */
  settle: 20,
  /** a frame this much longer than the one it should be counts as late */
  late: 1.25,
  /** a window with more than this share of late frames steps down */
  downShare: 0.2,
  /** a window counts as easy when fewer than this share are late ... */
  easyShare: 0.03,
  /** ... and the busiest 90 % of frames used under this share of a 60 Hz frame */
  easyBusy: 0.6,
  /** easy windows in a row before trying a level up */
  upWindows: 6,
  /** a level stepped up to that fails within this many windows waits longer before it is tried again */
  failWithin: 10,
  /** the most windows a failed level waits */
  maxWait: 120,
  /** a gap this long is the app in the background or paused, not a slow frame: the window starts again */
  away: 250,
} as const;

/**
 * Watches the frames of one view and moves the level. Pure: no clock of its own, no React, so it is tested with
 * made-up frames. Feed it every display frame with `frame`; it answers whether the level changed.
 */
export class Governor {
  private lvl: number;
  private chosen: GraphicsMode;
  private best: number;
  private worst: number;
  private locked: number | null = null;
  private n = 0;
  private late = 0;
  private readonly busy: number[] = [];
  private settle: number = TUNING.settle;
  private easy = 0;
  /** windows since the last step up, while it is still on trial */
  private trial = -1;
  /** per level: windows to wait before it may be tried again, and how long the next wait is */
  private readonly wait: number[] = LEVELS.map(() => 0);
  private readonly backoff: number[] = LEVELS.map(() => TUNING.upWindows);
  private readonly listeners = new Set<() => void>();

  constructor(start: number = TOP, mode: GraphicsMode = 'auto') {
    const r = rangeFor(mode);
    this.chosen = mode;
    this.best = r.best;
    this.worst = r.worst;
    this.lvl = clampLevel(start, r.best, r.worst);
  }

  get mode(): GraphicsMode {
    return this.chosen;
  }

  get level(): number {
    return this.locked ?? this.lvl;
  }

  get current(): Level {
    return LEVELS[this.level];
  }

  /** Tooling: hold one level whatever the frames say (null lets it adapt again). */
  force(level: number | null): void {
    const before = this.level;
    this.locked = level === null ? null : clampLevel(level, TOP, BOTTOM);
    this.restart();
    if (this.level !== before) this.emit();
  }

  /** The Settings choice changed: keep to its levels. */
  setMode(mode: GraphicsMode, start?: number): void {
    const before = this.level;
    const r = rangeFor(mode);
    this.chosen = mode;
    this.best = r.best;
    this.worst = r.worst;
    this.lvl = clampLevel(start ?? this.lvl, r.best, r.worst);
    this.restart();
    if (this.level !== before) this.emit();
  }

  /** Listen for level changes; returns the way to stop. Bound, so it can be handed on as it is (useSyncExternalStore). */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Forget the window under way (after a pause, a resize or the view coming back). */
  restart(): void {
    this.n = 0;
    this.late = 0;
    this.busy.length = 0;
    this.settle = TUNING.settle;
  }

  /**
   * One display frame that was drawn.
   * @param gap  ms since the frame drawn before it
   * @param busy ms this frame kept the JS thread: waiting for GL to catch up, the simulation and the drawing
   * @returns true when the level changed
   */
  frame(gap: number, busy: number): boolean {
    if (this.locked !== null) return false;
    if (gap >= TUNING.away || gap <= 0) {
      this.restart();
      return false;
    }
    if (this.settle > 0) {
      this.settle--;
      return false;
    }
    const half = LEVELS[this.lvl].half;
    const want = half ? FRAME_MS * 2 : FRAME_MS;
    if (gap > want * TUNING.late) this.late++;
    this.busy.push(busy);
    if (++this.n < TUNING.window) return false;
    const lateShare = this.late / this.n;
    const busy90 = pct90(this.busy);
    this.n = 0;
    this.late = 0;
    this.busy.length = 0;
    for (let i = 0; i < this.wait.length; i++) if (this.wait[i] > 0) this.wait[i]--;
    if (this.trial >= 0 && ++this.trial > TUNING.failWithin) this.trial = -1;

    if (lateShare > TUNING.downShare) {
      this.easy = 0;
      if (this.lvl >= this.worst) return false;
      // a level just stepped up to that cannot hold: it waits longer each time before it is tried again
      if (this.trial >= 0) {
        const failed = this.lvl;
        this.wait[failed] = this.backoff[failed];
        this.backoff[failed] = Math.min(TUNING.maxWait, this.backoff[failed] * 2);
        this.trial = -1;
      }
      return this.move(this.lvl + 1);
    }
    // at 30 a second a frame has two frames' time, but the question is whether 60 would fit
    const easy = lateShare < TUNING.easyShare && busy90 < FRAME_MS * TUNING.easyBusy;
    this.easy = easy ? this.easy + 1 : 0;
    if (this.easy >= TUNING.upWindows && this.lvl > this.best && this.wait[this.lvl - 1] === 0) {
      this.easy = 0;
      this.trial = 0;
      return this.move(this.lvl - 1);
    }
    return false;
  }

  /** for the frame probe and tooling */
  describe(): { level: number; locked: boolean; best: number; worst: number; wait: number[] } {
    return { level: this.level, locked: this.locked !== null, best: this.best, worst: this.worst, wait: [...this.wait] };
  }

  private move(to: number): boolean {
    const next = clampLevel(to, this.best, this.worst);
    if (next === this.lvl) return false;
    this.lvl = next;
    this.restart();
    this.emit();
    return true;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

function clampLevel(l: number, best: number, worst: number): number {
  return Math.max(best, Math.min(worst, Math.round(l)));
}

function pct90(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

/** at 30 a second, a display frame this much (ms) early for the next picture is still drawn: a frame's own jitter */
const EARLY = 4;

/**
 * Drawing at 30 a second at an even pace: given the time of this display frame and of the last one drawn, should
 * this one be drawn? Every second frame of a 60 Hz screen is, and every fourth of a 120 Hz one. A frame is drawn as
 * soon as 1/30 s (less a frame's jitter) has gone by, so a late frame never waits for the one after it.
 */
export function shouldDraw(half: boolean, now: number, lastDrawn: number): boolean {
  if (!half || lastDrawn < 0) return true;
  return now - lastDrawn >= FRAME_MS * 2 - EARLY;
}

// ---------------------------------------------------------------------------
// The app's governors: one for each kind of 3D view, all keeping to the Settings choice
// ---------------------------------------------------------------------------

/** the 3D views that adapt: the match, and the warm-up stage on the home page */
export type ViewKind = 'match' | 'stage';

let mode: GraphicsMode = 'auto';
/** the level each kind of view ended at last time, so the next one starts there instead of finding it again */
const learned: Record<ViewKind, number | null> = { match: null, stage: null };
const live = new Set<Governor>();
/** tooling: a level every new view holds */
let forced: number | null = null;

/** The Settings choice, from the save. A change applies to any view on screen now. */
export function setGraphicsMode(m: GraphicsMode): void {
  if (m === mode) return;
  mode = m;
  learned.match = null;
  learned.stage = null;
  for (const g of live) g.setMode(m);
  lightChanged();
}

export function graphicsMode(): GraphicsMode {
  return mode;
}

/**
 * A governor for a view that is starting: where the last one of its kind ended, or the device's own start. It follows
 * the Settings choice from when its view is on screen (`adoptGovernor`) until it is gone (`closeGovernor`).
 */
export function openGovernor(kind: ViewKind, facts: DeviceFacts = deviceFacts()): Governor {
  const start = learned[kind] ?? (kind === 'stage' && learned.match !== null ? learned.match : startLevel(facts));
  const g = new Governor(start, mode);
  if (forced !== null) g.force(forced);
  return g;
}

/** The governor's view is on screen: it follows the Settings choice and tooling from now on. */
export function adoptGovernor(g: Governor): void {
  if (live.has(g)) return;
  live.add(g);
  if (g.mode !== mode) g.setMode(mode);
  if (forced !== null) g.force(forced);
}

/** The view is gone: remember its level for the next one. */
export function closeGovernor(kind: ViewKind, g: Governor): void {
  live.delete(g);
  if (!g.describe().locked) learned[kind] = g.level;
  lightChanged();
}

// ---------------------------------------------------------------------------
// The menus: a device that draws its 3D without the extras gets lighter lettering and panels too
// ---------------------------------------------------------------------------

const menuListeners = new Set<() => void>();
let light = false;

/** the menus go light with Fast, or in Auto on a device whose 3D has had to drop its extras (or starts without them) */
export function menusLight(m: GraphicsMode = mode, levels: (number | null)[] = [learned.match, learned.stage, startLevel(deviceFacts())]): boolean {
  if (m === 'fast') return true;
  if (m === 'pretty') return false;
  return levels.some((l) => l !== null && !LEVELS[l].extras);
}

function lightChanged(): void {
  const now = menusLight();
  if (now === light) return;
  light = now;
  for (const fn of menuListeners) fn();
}

function subscribeMenus(fn: () => void): () => void {
  menuListeners.add(fn);
  return () => {
    menuListeners.delete(fn);
  };
}

let lightKnown = false;
function lightNow(): boolean {
  if (!lightKnown) {
    lightKnown = true;
    light = menusLight();
  }
  return light;
}

const lightOnServer = () => false;

/** For the arcade kit: true when the menus should stack fewer glows and shadows. */
export function useLightMenus(): boolean {
  return useSyncExternalStore(subscribeMenus, lightNow, lightOnServer);
}

/** Tooling (development builds): hold every view at one level, or null to let them adapt. */
export function forceLevel(level: number | null): void {
  forced = level;
  for (const g of live) g.force(level);
}

/** Tooling: the governors on screen now. */
export function liveGovernors(): { level: number; locked: boolean; best: number; worst: number; wait: number[] }[] {
  return [...live].map((g) => g.describe());
}
