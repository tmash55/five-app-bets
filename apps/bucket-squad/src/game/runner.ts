/**
 * Runs one match: owns the simulation, steps it at a fixed rate, draws it every
 * display frame and tells the screen what happened.
 */

import { Platform } from 'react-native';

import { perfAdd, perfFrame, perfHud, perfOn, perfReport, perfReset, perfStep } from './perf';
import { MatchRenderer, type MatchVisuals } from './render/renderer';
import { DT, RULES } from './sim/constants';
import { createMatch, stepMatch } from './sim/sim';
import type { MatchConfig, MatchState, PadInput, Phase, SimEvent } from './sim/types';

/** What the heads-up display needs, sampled a few times a second. */
export interface HudState {
  score: [number, number];
  quarter: number;
  overtime: boolean;
  /** game clock in tenths of a second */
  clock: number;
  /** whole seconds left on the shot clock */
  shotClock: number;
  phase: Phase;
  /** 3, 2, 1 before play starts, 0 otherwise */
  countdown: number;
  /** sprint energy of the controlled player, in twentieths */
  turbo: number;
  /** hype meter per team in twentieths, 21 while Hype is on */
  hype: [number, number];
  /** the person's team has the ball in hand: the buttons mean SHOOT and PASS, otherwise JUMP and STEAL */
  offense: boolean;
  /** index of the controlled player, -1 when watching */
  control: number;
}

export interface GLContextLike extends WebGL2RenderingContext {
  endFrameEXP?: () => void;
  flushEXP?: () => void;
}

/**
 * Call at the start of a frame, before any GL work. On native expo-gl, GL runs
 * on its own thread and JS can queue frames far ahead of it; this waits until
 * the GL thread has caught up, so JS is never more than one frame ahead. It
 * costs nothing when GL keeps up. The web has nothing to wait for.
 */
export function waitForGL(gl: GLContextLike): void {
  if (Platform.OS !== 'web') gl.flushEXP?.();
}

export interface RunnerHooks {
  onHud?: (hud: HudState) => void;
  onEvent?: (e: SimEvent, m: MatchState) => void;
  /** once per simulation step, after that step's events */
  onStep?: (m: MatchState) => void;
  onFinal?: (m: MatchState) => void;
}

function hudKey(h: HudState): string {
  return `${h.score[0]},${h.score[1]},${h.quarter},${h.overtime ? 1 : 0},${h.clock},${h.shotClock},${h.phase},${h.countdown},${h.turbo},${h.hype[0]},${h.hype[1]},${h.offense ? 1 : 0},${h.control}`;
}

export class MatchRunner {
  readonly m: MatchState;
  /** written by the controls, read once per simulation tick */
  readonly pad: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
  /** when true the display loop only draws; time moves through `advance` (used by tests and tooling) */
  manual = false;

  private renderer: MatchRenderer | null = null;
  private gl: GLContextLike | null = null;
  private raf = 0;
  private last = -1;
  private acc = 0;
  private lastHud = '';
  private finalSent = false;
  private paused = false;
  private hooks: RunnerHooks;
  private readonly visuals: MatchVisuals;

  constructor(config: MatchConfig, visuals: MatchVisuals, hooks: RunnerHooks = {}) {
    this.m = createMatch(config);
    this.visuals = visuals;
    this.hooks = hooks;
  }

  /** Choose who hears about the match. Replaces any earlier listeners. */
  listen(hooks: RunnerHooks): void {
    this.hooks = hooks;
    this.lastHud = '';
    this.sendHud();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      // drop whatever was held so nothing fires the moment play resumes
      const p = this.pad;
      p.mx = 0;
      p.mz = 0;
      p.turbo = false;
      p.a = false;
      p.b = false;
      p.sw = false;
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Call when the GL surface is ready. */
  attach(gl: GLContextLike): void {
    this.detach();
    this.gl = gl;
    this.renderer = new MatchRenderer(gl, this.visuals);
    this.last = -1;
    perfReset();
    this.raf = requestAnimationFrame(this.frame);
    this.sendHud();
  }

  detach(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    this.gl = null;
  }

  /** Tooling: shader programs built at warm-up and now; `now` growing during play means a program was built mid-game. */
  get glPrograms(): { warm: number; now: number } | null {
    const r = this.renderer;
    return r ? { warm: r.warmPrograms, now: r.programs } : null;
  }

  /** Screen position (0..1) of a world point, for callouts placed by the HUD. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    if (!this.renderer) return false;
    this.renderer.project(x, y, z, out);
    return true;
  }

  private tick(): void {
    const m = this.m;
    const r = this.renderer;
    if (r) r.beforeStep(m);
    stepMatch(m, this.pad);
    if (r) r.afterStep(m);
    if (perfOn()) perfStep(m.events.map((e) => e.type));
    const onEvent = this.hooks.onEvent;
    if (onEvent) {
      for (const e of m.events) onEvent(e, m);
    }
    this.hooks.onStep?.(m);
    if (m.phase === 'final' && !this.finalSent && m.phaseT > 2.4) {
      this.finalSent = true;
      perfReport('match');
      this.hooks.onFinal?.(m);
    }
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const r = this.renderer;
    const gl = this.gl;
    if (!r || !gl) return;
    const probe = perfOn();
    if (probe) perfFrame(this.last < 0 ? 0 : now - this.last);
    let t0 = probe ? performance.now() : 0;
    waitForGL(gl);
    if (probe) {
      const t1 = performance.now();
      perfAdd('wait', t1 - t0);
      t0 = t1;
    }
    let dt = this.last < 0 ? 0 : (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    const running = !this.paused && !this.manual;
    if (running) {
      this.acc += dt * r.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < 6) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
      if (this.acc >= DT) this.acc = 0;
    }
    if (probe) {
      const t1 = performance.now();
      perfAdd('sim', t1 - t0);
      t0 = t1;
    }
    r.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    r.render(this.m, this.manual ? 1 : this.acc / DT, running ? dt : 0);
    gl.endFrameEXP?.();
    if (probe) perfAdd('draw', performance.now() - t0);
    this.sendHud();
  };

  /** Move time forward by hand (tooling): steps the match and the animation without waiting for frames. */
  advance(seconds: number): void {
    const r = this.renderer;
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      this.tick();
      if (r) r.render(this.m, 1, DT, false);
    }
    this.sendHud();
  }

  /** Tooling: run forward until the test passes (or `maxSeconds` go by). Returns the seconds advanced. */
  advanceUntil(test: (m: MatchState) => boolean, maxSeconds = 60): number {
    const r = this.renderer;
    const n = Math.round(maxSeconds / DT);
    let i = 0;
    for (; i < n; i++) {
      this.tick();
      if (r) r.render(this.m, 1, DT, false);
      if (test(this.m)) break;
    }
    this.sendHud();
    return i * DT;
  }

  private sendHud(): void {
    const onHud = this.hooks.onHud;
    if (!onHud) return;
    const m = this.m;
    const c = m.control;
    const b = m.ball.state;
    const hud: HudState = {
      score: [m.score[0], m.score[1]],
      quarter: m.quarter,
      overtime: m.overtime,
      // whole seconds until the last ten, then tenths
      clock: m.clock >= 10 ? Math.ceil(m.clock - 1e-6) * 10 : Math.ceil(m.clock * 10 - 1e-6),
      shotClock: Math.ceil(m.shotClock - 1e-6),
      phase: m.phase,
      countdown: m.phase === 'countdown' ? Math.max(0, Math.ceil(RULES.countdown - m.phaseT - 1e-6)) : 0,
      turbo: c >= 0 ? Math.round(m.players[c].turbo * 20) : 0,
      hype: [m.hypeT[0] > 0 ? 21 : Math.round(m.hype[0] / 5), m.hypeT[1] > 0 ? 21 : Math.round(m.hype[1] / 5)],
      offense: c >= 0 ? m.possession === m.players[c].team && (b === 'held' || b === 'pass' || b === 'dead') : false,
      control: c,
    };
    const key = hudKey(hud);
    if (key === this.lastHud) return;
    this.lastHud = key;
    perfHud();
    onHud(hud);
  }
}
