import { stateHash } from '@/net/stateHash';
import { MAX_STEPS, runSteps } from '../clock';
import { BOTTOM, FRAME_MS, Governor, LEVELS, TOP, TUNING, rangeFor, shouldDraw, startLevel, type DeviceFacts } from '../quality';
import { DT } from '../sim/constants';
import { createMatch, stepMatch } from '../sim/sim';
import type { Attrs, MatchConfig } from '../sim/types';

const PHONE: DeviceFacts = { os: 'ios', isPad: false, osMajor: 18, pixels: 844 * 390 * 4 };
const pad = (osMajor: number): DeviceFacts => ({ os: 'ios', isPad: true, osMajor, pixels: 1024 * 768 * 4 });

/**
 * Feed a governor `windows` of its windows of frames, each `gap` ms apart and `busy` ms busy (after a change of level
 * the frames it lets go by while the view resizes come first); returns the level after each window.
 */
function feed(g: Governor, windows: number, gap: number | ((g: Governor) => number), busy: number | ((g: Governor) => number)): number[] {
  const seen: number[] = [];
  let changed = true;
  for (let w = 0; w < windows; w++) {
    const before = g.level;
    const n = TUNING.window + (changed ? TUNING.settle : 0);
    for (let i = 0; i < n; i++) g.frame(typeof gap === 'number' ? gap : gap(g), typeof busy === 'number' ? busy : busy(g));
    changed = g.level !== before;
    seen.push(g.level);
  }
  return seen;
}

/** the gap of a frame drawn at the governor's pace (every other display frame when it says so) */
const paced = (g: Governor, ms = FRAME_MS) => (g.current.half ? ms * 2 : ms);

describe('the graphics levels', () => {
  it('start with the full look, exactly as the game always drew, and only get lighter going down', () => {
    expect(LEVELS[TOP]).toEqual({ scale: 1, smooth: true, extras: true, half: false });
    for (let i = 1; i < LEVELS.length; i++) {
      const a = LEVELS[i - 1];
      const b = LEVELS[i];
      expect(b.scale).toBeLessThanOrEqual(a.scale);
      expect(Number(b.smooth)).toBeLessThanOrEqual(Number(a.smooth));
      expect(Number(b.extras)).toBeLessThanOrEqual(Number(a.extras));
      expect(Number(b.half)).toBeGreaterThanOrEqual(Number(a.half));
      expect(a).not.toEqual(b);
    }
    // resolution first, the extras next, and every other frame last
    expect(LEVELS.findIndex((l) => !l.extras)).toBeGreaterThan(LEVELS.findIndex((l) => l.scale < 1));
    expect(LEVELS.findIndex((l) => l.half)).toBe(BOTTOM);
  });

  it('starts phones at the top and older iPads lower, by the newest iPadOS they run', () => {
    expect(startLevel(PHONE)).toBe(TOP);
    expect(startLevel({ ...PHONE, os: 'web', osMajor: 0 })).toBe(TOP);
    expect(startLevel(pad(15))).toBe(3);
    expect(startLevel(pad(16))).toBe(3);
    expect(startLevel(pad(17))).toBe(2);
    expect(startLevel(pad(18))).toBe(1);
    expect(startLevel(pad(26))).toBe(TOP);
    // a small iPad screen (a mini drawing fewer pixels than the cut-off) is treated like a phone
    expect(startLevel({ ...pad(16), pixels: 1e6 })).toBe(TOP);
  });

  it('keeps each Settings choice to its own levels', () => {
    expect(rangeFor('auto')).toEqual({ best: TOP, worst: BOTTOM });
    expect(rangeFor('pretty')).toEqual({ best: TOP, worst: TOP });
    expect(rangeFor('fast').best).toBeGreaterThan(TOP);
    expect(LEVELS[rangeFor('fast').best].extras).toBe(false);
    expect(new Governor(3, 'pretty').level).toBe(TOP);
    expect(new Governor(0, 'fast').level).toBe(rangeFor('fast').best);
  });
});

describe('the governor', () => {
  it('stays at the top while every frame is on time', () => {
    const g = new Governor(TOP);
    expect(feed(g, 30, FRAME_MS, 6)).toEqual(Array(30).fill(TOP));
  });

  it('steps down one level after a second of slow frames, and keeps going down while they stay slow', () => {
    const g = new Governor(TOP);
    // 40 frames a second: every frame is late
    expect(feed(g, 3, 25, 24)).toEqual([1, 2, 3]);
    expect(feed(g, 10, 25, 24).at(-1)).toBe(BOTTOM);
  });

  it('does not step down for one hitch, or for a few late frames in a second', () => {
    const g = new Governor(TOP);
    for (let i = 0; i < 1000; i++) g.frame(i % 10 === 0 ? 40 : FRAME_MS, 8);
    expect(g.level).toBe(TOP);
  });

  it('does not count a pause or the app in the background as slow frames', () => {
    const g = new Governor(TOP);
    for (let i = 0; i < 500; i++) g.frame(i % 30 === 0 ? 2000 : FRAME_MS, 5);
    expect(g.level).toBe(TOP);
  });

  it('steps up only after several easy seconds, one level at a time', () => {
    const g = new Governor(4);
    const levels = feed(g, TUNING.upWindows * 3, FRAME_MS, 4);
    expect(levels.slice(0, TUNING.upWindows - 1).every((l) => l === 4)).toBe(true);
    expect(levels[TUNING.upWindows - 1]).toBe(3);
    // never more than one level between two windows
    for (let i = 1; i < levels.length; i++) expect(levels[i - 1] - levels[i]).toBeLessThanOrEqual(1);
  });

  it('does not step up while frames are on time but use most of their time', () => {
    const g = new Governor(3);
    expect(feed(g, 40, FRAME_MS, FRAME_MS * 0.8).at(-1)).toBe(3);
  });

  it('waits longer each time before trying again a level that could not hold (no flicker between two levels)', () => {
    // a device that holds 60 at level 3 with room to spare and is slow at level 2
    const g = new Governor(3);
    const slow = (x: Governor) => x.level <= 2;
    const levels = feed(g, 600, (x) => (slow(x) ? 24 : FRAME_MS), (x) => (slow(x) ? 22 : 5));
    const tries = levels.map((l, w) => (l === 2 && (w === 0 || levels[w - 1] === 3) ? w : -1)).filter((w) => w >= 0);
    // it tries level 2, falls back, and the tries come further and further apart
    expect(tries.length).toBeGreaterThanOrEqual(3);
    const apart = tries.slice(1).map((w, i) => w - tries[i]);
    for (let i = 1; i < apart.length; i++) expect(apart[i]).toBeGreaterThanOrEqual(apart[i - 1]);
    expect(apart.at(-1)).toBeGreaterThan(apart[0] * 2);
    // over ten minutes it spends nearly all its time at the level that holds, and never goes below it
    expect(levels.filter((l) => l === 3).length).toBeGreaterThan(560);
    expect(Math.max(...levels)).toBe(3);
    expect(levels.at(-1)).toBe(3);
  });

  it('draws every other frame only at the bottom, and steps back up to 60 when 30 is easy', () => {
    const g = new Governor(BOTTOM);
    expect(g.current.half).toBe(true);
    // at 30 a second the frames are on time; with plenty of room left in each one it tries 60 again
    feed(g, TUNING.upWindows, paced, 6);
    expect(g.level).toBe(BOTTOM - 1);
    expect(g.current.half).toBe(false);
  });

  it('holds a forced level, and a change of choice keeps to the new range and tells its listeners', () => {
    const g = new Governor(TOP);
    let heard = 0;
    // handed on unbound, as a view hands it to React
    const { subscribe } = g;
    const stop = subscribe(() => heard++);
    g.force(2);
    expect(g.level).toBe(2);
    feed(g, 10, 30, 28);
    expect(g.level).toBe(2);
    g.force(null);
    g.setMode('fast');
    expect(g.level).toBe(rangeFor('fast').best);
    feed(g, 20, FRAME_MS, 2);
    expect(g.level).toBe(rangeFor('fast').best);
    g.setMode('pretty');
    feed(g, 20, 40, 38);
    expect(g.level).toBe(TOP);
    stop();
    expect(heard).toBe(4);
  });
});

describe('drawing every other frame', () => {
  it('draws every frame at the full rate', () => {
    expect(shouldDraw(false, 16.7, 0)).toBe(true);
  });

  it('draws every second frame of a 60 Hz screen and every fourth of a 120 Hz one, evenly', () => {
    for (const hz of [60, 120]) {
      const vsync = 1000 / hz;
      let last = -1;
      const drawn: number[] = [];
      for (let f = 0; f < hz * 2; f++) {
        // a little jitter on every frame
        const now = f * vsync + (f % 3) * 0.6;
        if (shouldDraw(true, now, last)) {
          if (last >= 0) drawn.push(now - last);
          last = now;
        }
      }
      expect(drawn.length).toBeGreaterThanOrEqual(58);
      expect(drawn.length).toBeLessThanOrEqual(60);
      for (const gap of drawn) expect(Math.abs(gap - 1000 / 30)).toBeLessThan(2);
    }
  });

  it('never makes a late frame wait for the one after', () => {
    expect(shouldDraw(true, 40, 0)).toBe(true);
    expect(shouldDraw(true, 31, 0)).toBe(true);
    expect(shouldDraw(true, 18, 0)).toBe(false);
  });
});

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

function config(seed: number): MatchConfig {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.35 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.4 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ],
  });
  return { seed, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand: 0, autoSwitch: true };
}

/**
 * Play `seconds` of display time through the runner's clock: a display frame every `vsync` ms, drawn every frame or
 * every other one. Returns the match, the steps each drawn frame ran and the hash of the match after every step.
 */
function playThrough(seed: number, seconds: number, vsync: number, half: boolean, hitches: number[] = []) {
  const m = createMatch(config(seed));
  const frames: [null, null] = [null, null];
  const perFrame: number[] = [];
  const hashes: number[] = [];
  let acc = 0;
  let last = -1;
  let n = 0;
  const tick = () => {
    stepMatch(m, frames);
    hashes.push(stateHash(m));
    n++;
  };
  let now = 0;
  for (let f = 0; now < seconds * 1000; f++) {
    now += hitches.includes(f) ? 180 : vsync;
    if (!shouldDraw(half, now, last)) continue;
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    const before = n;
    acc = runSteps(acc, dt, 1, DT, () => true, tick);
    perFrame.push(n - before);
  }
  return { m, perFrame, hashes };
}

describe('the game clock', () => {
  it('keeps 60 steps a second when drawing at 30, two a frame, and the game is the very same', () => {
    const full = playThrough(7, 20, 1000 / 60, false);
    const half = playThrough(7, 20, 1000 / 60, true);
    expect(full.hashes.length).toBeGreaterThanOrEqual(1199);
    expect(Math.abs(half.hashes.length - full.hashes.length)).toBeLessThanOrEqual(1);
    // every second of play runs 60 steps either way: one a frame at 60, two a frame at 30
    const perSecond = (p: number[], fps: number) => Array.from({ length: Math.floor(p.length / fps) - 1 }, (_, s) => p.slice(1 + s * fps, 1 + (s + 1) * fps).reduce((a, x) => a + x, 0));
    for (const n of perSecond(full.perFrame, 60)) expect(Math.abs(n - 60)).toBeLessThanOrEqual(1);
    for (const n of perSecond(half.perFrame, 30)) expect(Math.abs(n - 60)).toBeLessThanOrEqual(1);
    expect(half.perFrame.slice(1).reduce((a, x) => a + x, 0) / (half.perFrame.length - 1)).toBeCloseTo(2, 1);
    // step for step the same match: drawing less never changes what happens
    const k = Math.min(full.hashes.length, half.hashes.length);
    expect(half.hashes.slice(0, k)).toEqual(full.hashes.slice(0, k));
  });

  it('a slow frame runs at most a capped number of catch-up steps, and changes nothing but how many', () => {
    const smooth = playThrough(12, 10, 1000 / 60, false);
    const rough = playThrough(12, 10, 1000 / 60, false, [100, 101, 102, 300]);
    expect(Math.max(...rough.perFrame)).toBe(MAX_STEPS);
    const k = Math.min(smooth.hashes.length, rough.hashes.length);
    expect(rough.hashes.slice(0, k)).toEqual(smooth.hashes.slice(0, k));
    // a stall of 180 ms is cut to 100: the game loses the rest instead of racing to catch up
    expect(smooth.hashes.length - rough.hashes.length).toBeGreaterThan(0);
  });

  it('runs no step while the other device has not sent its moves, and drops the wait instead of bursting later', () => {
    let ticks = 0;
    let acc = 0;
    acc = runSteps(acc, 0.05, 1, DT, () => false, () => ticks++);
    expect(ticks).toBe(0);
    expect(acc).toBe(0);
    acc = runSteps(acc, 1 / 60, 1, DT, () => true, () => ticks++);
    expect(ticks).toBe(1);
  });
});
