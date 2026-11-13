/**
 * A frame probe for finding hitches in a match on a phone, where there is no profiler at hand.
 *
 * Off unless the bundle is started with EXPO_PUBLIC_BS_PERF=1 (any build, release included) or a development
 * build sets `globalThis.__perfOn = true` before the match. When on, every display frame of a match is noted with
 * how long it waited for the GL thread, how long the simulation and the drawing took in JS, what happened in the
 * game that frame and which sounds started or were loaded. At the end of the match one line starting with BSPERF
 * goes to the console with the slow frames and what they had in common, so a device log shows it.
 */

const ENV_ON = process.env.EXPO_PUBLIC_BS_PERF === '1';

/** a frame that took this long or more counts as a hitch (a 60 Hz frame is 16.7 ms) */
const SLOW_MS = 50;
const KEEP = 4000;

interface Frame {
  /** ms since the frame before */
  gap: number;
  /** ms spent waiting for the GL thread to catch up */
  wait: number;
  /** ms of simulation steps */
  sim: number;
  /** ms of drawing (JS side) */
  draw: number;
  steps: number;
  events: string[];
  sounds: string[];
  /** sound pools made this frame (players loaded from disk) */
  loads: string[];
  hud: boolean;
}

let current: Frame | null = null;
const frames: Frame[] = [];

export function perfOn(): boolean {
  return ENV_ON || (globalThis as { __perfOn?: boolean }).__perfOn === true;
}

/** Start noting a frame; `gap` is the time since the last one. */
export function perfFrame(gap: number): void {
  if (!perfOn()) return;
  current = { gap, wait: 0, sim: 0, draw: 0, steps: 0, events: [], sounds: [], loads: [], hud: false };
  frames.push(current);
  if (frames.length > KEEP) frames.shift();
}

export function perfAdd(part: 'wait' | 'sim' | 'draw', ms: number): void {
  if (current) current[part] += ms;
}

export function perfStep(eventTypes: readonly string[]): void {
  if (!current) return;
  current.steps++;
  for (const t of eventTypes) current.events.push(t);
}

export function perfSound(name: string): void {
  if (current) current.sounds.push(name);
}

export function perfLoad(name: string): void {
  if (current) current.loads.push(name);
}

export function perfHud(): void {
  if (current) current.hud = true;
}

export interface PerfSummary {
  frames: number;
  fps: number;
  /** frames at or over SLOW_MS */
  slow: number;
  /** frames at or over 100 ms */
  stalls: number;
  worst: number;
  /** of the slow frames, how many had each thing happen in them, against how often it happens in any frame */
  together: Record<string, { slow: number; all: number }>;
  /** the slowest frames with what happened in them */
  top: (Omit<Frame, 'gap' | 'wait' | 'sim' | 'draw'> & { gap: number; wait: number; sim: number; draw: number })[];
}

const round = (n: number) => Math.round(n * 10) / 10;

export function perfSummary(): PerfSummary {
  // the first frames build the scene and are not part of play
  const play = frames.slice(30);
  const total = play.reduce((a, f) => a + f.gap, 0);
  const slow = play.filter((f) => f.gap >= SLOW_MS);
  const tags = (f: Frame) => new Set([...f.events.map((e) => `event:${e}`), ...f.sounds.map((s) => `sound:${s}`), ...f.loads.map((s) => `load:${s}`), ...(f.hud ? ['hud'] : []), ...(f.steps > 1 ? ['catch-up'] : [])]);
  const together: PerfSummary['together'] = {};
  for (const f of play) for (const t of tags(f)) (together[t] ??= { slow: 0, all: 0 }).all++;
  for (const f of slow) for (const t of tags(f)) together[t].slow++;
  for (const k of Object.keys(together)) if (together[k].slow === 0) delete together[k];
  const top = [...slow]
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 12)
    .map((f) => ({ ...f, gap: round(f.gap), wait: round(f.wait), sim: round(f.sim), draw: round(f.draw) }));
  return {
    frames: play.length,
    fps: total > 0 ? round((play.length * 1000) / total) : 0,
    slow: slow.length,
    stalls: play.filter((f) => f.gap >= 100).length,
    worst: round(Math.max(0, ...play.map((f) => f.gap))),
    together,
    top,
  };
}

/** Log the summary in one line a device log can be searched for, and start over. */
export function perfReport(label: string): void {
  if (!perfOn() || frames.length === 0) return;
  console.log(`BSPERF ${label} ${JSON.stringify(perfSummary())}`);
  frames.length = 0;
  current = null;
}

export function perfReset(): void {
  frames.length = 0;
  current = null;
}
