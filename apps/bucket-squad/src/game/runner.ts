/**
 * Runs one match: owns the simulation, steps it at a fixed rate, draws it every
 * display frame and tells the screen what happened.
 */

import { Platform } from 'react-native';

import { perfAdd, perfFrame, perfHud, perfOn, perfReport, perfReset, perfStep } from './perf';
import { MatchRenderer, type MatchVisuals } from './render/renderer';
import { DT, FIRE, RULES } from './sim/constants';
import { ignite } from './sim/fire';
import { emptyFrame } from './sim/input';
import { isHuman } from './sim/seats';
import { createMatch, stepMatch } from './sim/sim';
import type { InputFrame, MatchConfig, MatchState, PadInput, Phase, SimEvent, TeamId } from './sim/types';

/**
 * Where one team's input comes from, a frame for every tick. The pad on this screen is one (`LocalPad`); a later
 * network peer is another: it hands out the frames the other machine sent, tick by tick, and says it is not ready
 * while the frame for the next tick has not arrived, so the match waits for it instead of guessing.
 */
export interface InputSource {
  /** the frame `team` plays on the tick about to be stepped (`m.tick + 1`) */
  frame(tick: number, team: TeamId): InputFrame | null;
  /** false while the frame for `tick` is not here yet; left out, always ready */
  ready?(tick: number): boolean;
}

/** A pad on this screen: the controls write into `pad`, and every tick plays what it holds. */
export class LocalPad implements InputSource {
  constructor(readonly pad: PadInput) {}

  frame(): InputFrame {
    return this.pad;
  }
}

/** What the HUD needs about the second person in a two-player game. */
export interface SeatHud {
  /** sprint energy of their player, in twentieths */
  turbo: number;
  /** their team has the ball in hand */
  offense: boolean;
  /** their controlled player, -1 when none */
  control: number;
}

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
  /** each player's flame meter in twentieths, 21 while on fire (simulation order) */
  fire: number[];
  /** the person's team has the ball in hand: the buttons mean SHOOT and PASS, otherwise JUMP and STEAL */
  offense: boolean;
  /** index of the controlled player, -1 when watching */
  control: number;
  /** the second person in a two-player game, null otherwise */
  second: SeatHud | null;
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
  return `${h.score[0]},${h.score[1]},${h.quarter},${h.overtime ? 1 : 0},${h.clock},${h.shotClock},${h.phase},${h.countdown},${h.turbo},${h.hype[0]},${h.hype[1]},${h.fire.join('.')},${h.offense ? 1 : 0},${h.control},${h.second ? `${h.second.turbo},${h.second.offense ? 1 : 0},${h.second.control}` : '-'}`;
}

export class MatchRunner {
  readonly m: MatchState;
  /** each team's pad on this screen, home first: written by the controls, read once per simulation tick */
  readonly pads: [PadInput, PadInput] = [emptyFrame(), emptyFrame()];
  /** where each team's frames come from: this screen's pad for a team a person plays here, nothing for the computer's */
  private readonly sources: [InputSource | null, InputSource | null];
  /** the frames of the tick being stepped, reused */
  private readonly frames: [InputFrame | null, InputFrame | null] = [null, null];
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
    const local = (t: TeamId) => (isHuman(this.m, t) || (t === 0 && config.userTeam === -1) ? new LocalPad(this.pads[t]) : null);
    this.sources = [local(0), local(1)];
  }

  /** The pad of the person on this screen (the first person's in a two-player game). */
  get pad(): PadInput {
    return this.pads[this.m.cfg.userTeam === 1 ? 1 : 0];
  }

  /** Feed a team from somewhere else, such as a network peer. Null hands the team's frames back to nobody. */
  setSource(team: TeamId, source: InputSource | null): void {
    this.sources[team] = source;
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
      for (const p of this.pads) {
        p.mx = 0;
        p.mz = 0;
        p.turbo = false;
        p.a = false;
        p.b = false;
        p.sw = false;
      }
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

  /** Every team's source has its frame for the next tick. */
  private ready(): boolean {
    const next = this.m.tick + 1;
    for (const s of this.sources) if (s?.ready && !s.ready(next)) return false;
    return true;
  }

  private tick(): void {
    const m = this.m;
    const r = this.renderer;
    if (r) r.beforeStep(m);
    const next = m.tick + 1;
    const [home, away] = this.sources;
    this.frames[0] = home ? home.frame(next, 0) : null;
    this.frames[1] = away ? away.frame(next, 1) : null;
    stepMatch(m, this.frames);
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
      while (this.acc >= DT && steps < 6 && this.ready()) {
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

  /** Tooling (development builds only): set a player on fire now, or fill their meter part way (`heat` 0..FIRE.max). */
  devFire(player: number, heat: number = FIRE.max): void {
    if (!__DEV__) return;
    const p = this.m.players[player];
    if (!p) return;
    // the last step's events have all been heard already
    this.m.events.length = 0;
    if (heat >= FIRE.max) ignite(this.m, p);
    else p.heat = Math.max(0, heat);
    // the director and renderer hear about it like any other fire
    const r = this.renderer;
    if (r) r.afterStep(this.m);
    const onEvent = this.hooks.onEvent;
    if (onEvent) for (const e of this.m.events) onEvent(e, this.m);
    this.m.events.length = 0;
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
      fire: m.players.map((p) => (p.fireT > 0 ? 21 : Math.min(20, Math.floor((p.heat / FIRE.max) * 20)))),
      offense: c >= 0 ? m.possession === m.players[c].team && (b === 'held' || b === 'pass' || b === 'dead') : false,
      control: c,
      second: null,
    };
    const c2 = m.second.control;
    if (c2 >= 0) {
      hud.second = {
        turbo: Math.round(m.players[c2].turbo * 20),
        offense: m.possession === m.players[c2].team && (b === 'held' || b === 'pass' || b === 'dead'),
        control: c2,
      };
    }
    const key = hudKey(hud);
    if (key === this.lastHud) return;
    this.lastHud = key;
    perfHud();
    onHud(hud);
  }
}
