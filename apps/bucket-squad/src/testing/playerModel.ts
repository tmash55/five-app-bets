/**
 * A made-up person on the pad, for measuring how hard the game is: it holds the stick and presses the buttons the way
 * a real person does, through the same input frames a thumb on a phone makes. It sees the court a beat late (its
 * reaction time), changes its mind only every so often, aims the stick roughly, times its shots with an error, and
 * now and then does nothing useful at all. Three of them: a young beginner who chases the ball and mashes buttons,
 * an adult who is new to the game, and a good player.
 *
 * It never touches the match's own random numbers (it has its own), so a game with it is as deterministic as any.
 */

import { COURT, DT, LAYUP, SHOT } from '@/game/sim/constants';
import { attackSign, canDunk, dunkRange, hoopXOf, isThree, laneClear, makeProb, nearestOpponentDist, shootingRange, shotApexTime, shotContest } from '@/game/sim/core';
import { clamp, hypot2 } from '@/game/sim/math';
import type { MatchState, PadInput, PlayerSim, TeamId } from '@/game/sim/types';

export interface PlayerSkill {
  name: string;
  /** seconds from something happening on the court to the thumb doing something about it */
  reaction: number;
  /** seconds between fresh looks at what to do (a decision holds in between) */
  rethink: number;
  /** how far off the stick points from where they mean to go (radians, either way) */
  aim: number;
  /** of the jump shots: the share that are a quick tap (released at the top by itself, an "ok" shot) */
  tap: number;
  /** of the jump shots: the share held down until the game lets go by itself (late) */
  holdLong: number;
  /** the rest are timed: error of the release in seconds (spread, and how early or late on average) */
  timingSd: number;
  timingBias: number;
  /** 0..1 how well they pick a shot: 0 shoots from anywhere once near enough, 1 waits for a good look */
  shotSense: number;
  /** how near the hoop a beginner gets before shooting (they shoot once inside a distance picked in this range) */
  shootFrom: readonly [number, number];
  /** seconds with the ball before they give up looking and shoot anyway */
  patience: readonly [number, number];
  /** chance per decision to throw a pass for no special reason */
  randomPass: number;
  /** 0..1 how well they spot an open teammate and pass to them */
  passSense: number;
  /** on defense: chance per decision of running straight at the ball instead of guarding */
  chase: number;
  /** how far in front of the man they guard they stand (between the man and the hoop) */
  gap: number;
  /** steal swipes a second when the ball is within reach (mashing) */
  swipeRate: number;
  /** how near the ball handler they need to be before they swipe */
  swipeReach: number;
  /** chance of going up when a shooter near them shoots */
  contest: number;
  /** jumps a second for no reason near the ball (mashing the other button) */
  randomJump: number;
  /** chance per decision of doing nothing useful (wandering, or the thumb off the stick) */
  idle: number;
  /** share of the time the sprint is held */
  turbo: number;
  /** leads a moving target by its speed times this many seconds */
  anticipate: number;
  /** presses switch to take the defender nearest the ball when their own is far away */
  switches: boolean;
  /** shakes the defender with sharp changes of direction */
  jukes: boolean;
}

/** A young child: chases the ball, mashes both buttons, shoots once fairly near the hoop, barely times the release. */
export const BEGINNER: PlayerSkill = {
  name: 'beginner',
  reaction: 0.5,
  rethink: 0.45,
  aim: 0.6,
  tap: 0.35,
  holdLong: 0.25,
  timingSd: 0.22,
  timingBias: -0.04,
  shotSense: 0,
  shootFrom: [1.5, 8],
  patience: [1.5, 6],
  randomPass: 0.06,
  passSense: 0,
  chase: 0.85,
  gap: 0.6,
  swipeRate: 2.2,
  swipeReach: 2.4,
  contest: 0.35,
  randomJump: 0.35,
  idle: 0.14,
  turbo: 0.65,
  anticipate: 0,
  switches: false,
  jukes: false,
};

/** An adult new to the game: knows basketball, not this game; decent timing, guards but still gets pulled to the ball. */
export const AVERAGE: PlayerSkill = {
  name: 'average',
  reaction: 0.3,
  rethink: 0.3,
  aim: 0.25,
  tap: 0.1,
  holdLong: 0.05,
  timingSd: 0.1,
  timingBias: -0.01,
  shotSense: 0.55,
  shootFrom: [2, 6.5],
  patience: [5, 9],
  randomPass: 0.02,
  passSense: 0.5,
  chase: 0.3,
  gap: 1.3,
  swipeRate: 0.9,
  swipeReach: 1.5,
  contest: 0.7,
  randomJump: 0.05,
  idle: 0.04,
  turbo: 0.4,
  anticipate: 0.15,
  switches: false,
  jukes: false,
};

/** A good player: quick, picks good shots, times them well, guards between the man and the hoop and contests. */
export const GOOD: PlayerSkill = {
  name: 'good',
  reaction: 0.2,
  rethink: 0.2,
  aim: 0.1,
  tap: 0,
  holdLong: 0,
  timingSd: 0.05,
  timingBias: 0,
  shotSense: 0.9,
  shootFrom: [2, 6.5],
  patience: [7, 11],
  randomPass: 0,
  passSense: 0.9,
  chase: 0.08,
  gap: 1.1,
  swipeRate: 0.8,
  swipeReach: 1.2,
  contest: 0.9,
  randomJump: 0,
  idle: 0.01,
  turbo: 0.35,
  anticipate: 0.3,
  switches: true,
  jukes: true,
};

export const PLAYER_SKILLS: readonly PlayerSkill[] = [BEGINNER, AVERAGE, GOOD];

/** What the person saw of one player, a moment ago. */
interface Seen {
  x: number;
  z: number;
  vx: number;
  vz: number;
  state: PlayerSim['state'];
  t: number;
  hasBall: boolean;
}

interface View {
  players: Seen[];
  bx: number;
  by: number;
  bz: number;
  ball: MatchState['ball']['state'];
  holder: number;
  possession: TeamId;
}

/** how many ticks of what was seen are kept (more than the slowest reaction) */
const MEMORY = 90;

export class PlayerModel {
  readonly pad: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
  private s: number;
  private views: View[] = [];
  private head = -1;
  private nextThink = 0;
  private tick = 0;
  // the current decision
  private mx = 0;
  private mz = 0;
  private sprint = false;
  private aHeld = 0;
  private bHeld = 0;
  private swHeld = 0;
  /** a press waiting out the reaction time: the tick it lands on, and how long it is held */
  private pendingA = -1;
  private pendingAHold = 0;
  private pendingB = -1;
  private pendingSw = -1;
  /** the shot in hand: when to let go (seconds into the shot), or -1 to hold until the game lets go */
  private releaseAt = -2;
  private shooting = false;
  private ballSince = -1;
  private shootFrom = 4;
  private patience = 4;
  private jumpedFor = -1;
  private jukeT = 0;
  /** the player in hand last tick, to notice a new one */
  private lastPos = -1;

  constructor(
    readonly skill: PlayerSkill,
    seed: number,
    readonly team: TeamId = 0,
  ) {
    this.s = seed >>> 0 || 1;
    for (let i = 0; i < MEMORY; i++) this.views.push({ players: [], bx: 0, by: 0, bz: 0, ball: 'dead', holder: -1, possession: 0 });
  }

  private rand(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }

  private between(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rand();
  }

  private gauss(): number {
    return (this.rand() + this.rand() + this.rand() + this.rand() - 2) * 1.73;
  }

  private remember(m: MatchState): void {
    this.head = (this.head + 1) % MEMORY;
    const v = this.views[this.head];
    while (v.players.length < m.players.length) v.players.push({ x: 0, z: 0, vx: 0, vz: 0, state: 'free', t: 0, hasBall: false });
    for (const p of m.players) {
      const s = v.players[p.idx];
      s.x = p.x;
      s.z = p.z;
      s.vx = p.vx;
      s.vz = p.vz;
      s.state = p.state;
      s.t = p.t;
      s.hasBall = p.hasBall;
    }
    v.bx = m.ball.x;
    v.by = m.ball.y;
    v.bz = m.ball.z;
    v.ball = m.ball.state;
    v.holder = m.ball.state === 'held' ? m.ball.holder : -1;
    v.possession = m.possession;
  }

  /** The court as it looked `reaction` seconds ago. */
  private seen(): View {
    const back = Math.min(MEMORY - 1, Math.round(this.skill.reaction / DT), this.tick);
    return this.views[(this.head - back + MEMORY * 2) % MEMORY];
  }

  private control(m: MatchState): PlayerSim | null {
    const i = this.team === m.cfg.userTeam ? m.control : m.second.control;
    return i >= 0 ? m.players[i] : null;
  }

  /** Point the stick at a spot, roughly. */
  private steer(p: PlayerSim, tx: number, tz: number, sprint: boolean, slow = 0.25): void {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = hypot2(dx, dz);
    if (d < slow) {
      this.mx = 0;
      this.mz = 0;
      this.sprint = false;
      return;
    }
    const a = Math.atan2(dz, dx) + (this.rand() * 2 - 1) * this.skill.aim;
    const k = d < 1 ? Math.max(0.35, d) : 1;
    this.mx = Math.cos(a) * k;
    this.mz = Math.sin(a) * k;
    this.sprint = sprint && d > 1.2;
  }

  private pressA(after: number, hold: number): void {
    if (this.pendingA >= 0 || this.aHeld > 0) return;
    this.pendingA = this.tick + Math.max(1, Math.round(after / DT));
    this.pendingAHold = hold;
  }

  private pressB(after: number): void {
    if (this.pendingB >= 0 || this.bHeld > 0) return;
    this.pendingB = this.tick + Math.max(1, Math.round(after / DT));
  }

  /** The pad for the next tick of `m`. */
  step(m: MatchState): PadInput {
    this.tick++;
    this.remember(m);
    const p = this.control(m);
    const live = m.phase === 'live';
    if (!live || !p) {
      // between plays the thumb comes off the buttons
      this.pendingA = this.pendingB = this.pendingSw = -1;
      this.aHeld = this.bHeld = this.swHeld = 0;
      this.shooting = false;
      this.releaseAt = -2;
      this.ballSince = -1;
      this.pad.a = this.pad.b = this.pad.sw = false;
      this.pad.mx = this.pad.mz = 0;
      this.pad.turbo = false;
      this.nextThink = this.tick;
      return this.pad;
    }
    if (p.idx !== this.lastPos) {
      this.lastPos = p.idx;
      this.ballSince = -1;
    }
    if (p.hasBall) {
      if (this.ballSince < 0) {
        this.ballSince = this.tick;
        this.shootFrom = this.between(this.skill.shootFrom);
        this.patience = this.between(this.skill.patience);
      }
    } else if (p.state !== 'shoot') {
      this.ballSince = -1;
    }
    this.shotInHand(m, p);
    if (this.tick >= this.nextThink && !this.shooting) {
      this.nextThink = this.tick + Math.max(1, Math.round((this.skill.rethink * (0.7 + 0.6 * this.rand())) / DT));
      this.think(m, p);
    }
    this.reflexes(m, p);
    // presses land once the reaction time is up
    if (this.pendingA >= 0 && this.tick >= this.pendingA) {
      this.pendingA = -1;
      this.aHeld = this.pendingAHold;
    }
    if (this.pendingB >= 0 && this.tick >= this.pendingB) {
      this.pendingB = -1;
      this.bHeld = 3 + Math.floor(this.rand() * 4);
    }
    if (this.pendingSw >= 0 && this.tick >= this.pendingSw) {
      this.pendingSw = -1;
      this.swHeld = 2;
    }
    // a press only lands once the button is up (see pressA), so the game sees every new press as a press
    this.pad.a = this.aHeld > 0;
    if (this.aHeld > 0 && this.aHeld < 1e6) this.aHeld--;
    this.pad.b = this.bHeld > 0;
    if (this.bHeld > 0) this.bHeld--;
    this.pad.sw = this.swHeld > 0;
    if (this.swHeld > 0) this.swHeld--;
    this.pad.mx = clamp(this.mx, -1, 1);
    this.pad.mz = clamp(this.mz, -1, 1);
    this.pad.turbo = this.sprint;
    return this.pad;
  }

  /** Holding a jump shot: let go at the planned moment. */
  private shotInHand(m: MatchState, p: PlayerSim): void {
    if (p.state === 'shoot' && p.hasBall && !p.released) {
      if (!this.shooting) {
        this.shooting = true;
        const r = this.rand();
        const k = this.skill;
        if (r < k.tap) this.releaseAt = 0.02;
        else if (r < k.tap + k.holdLong) this.releaseAt = -1;
        else this.releaseAt = Math.max(SHOT.crouch + 0.07, shotApexTime() + k.timingBias + this.gauss() * k.timingSd);
        this.mx = 0;
        this.mz = 0;
        this.sprint = false;
      }
      if (this.releaseAt === -1) this.aHeld = 1e6;
      else this.aHeld = p.t + DT < this.releaseAt ? 1e6 : 0;
      return;
    }
    if (this.shooting) {
      this.shooting = false;
      this.aHeld = 0;
      this.releaseAt = -2;
    }
  }

  private think(m: MatchState, p: PlayerSim): void {
    const k = this.skill;
    if (this.rand() < k.idle) {
      // the thumb wanders, or comes off the stick
      if (this.rand() < 0.5) {
        this.mx = 0;
        this.mz = 0;
      } else {
        const a = this.rand() * Math.PI * 2;
        this.mx = Math.cos(a);
        this.mz = Math.sin(a);
      }
      this.sprint = false;
      return;
    }
    const v = this.seen();
    const b = m.ball;
    if (p.hasBall) {
      this.offense(m, p, v);
      return;
    }
    if (v.ball === 'loose' || v.ball === 'shot') {
      this.chaseBall(m, p, v, true);
      return;
    }
    if (m.possession === this.team) {
      // a pass in the air to this player, or play is about to restart: head up the floor
      const hx = hoopXOf(this.team);
      this.steer(p, hx - attackSign(this.team) * 3, p.z * 0.5, this.rand() < k.turbo);
      return;
    }
    if (b.state === 'dead') return;
    this.defense(m, p, v);
  }

  private chaseBall(m: MatchState, p: PlayerSim, v: View, rebound: boolean): void {
    const k = this.skill;
    let tx = v.bx;
    let tz = v.bz;
    if (rebound && v.ball === 'shot' && k.anticipate > 0) {
      // a good player goes to where the rebound will come down, near the rim
      const hx = hoopXOf(m.ball.shotTeam);
      tx = hx - attackSign(m.ball.shotTeam) * 1.4;
      tz = clamp(v.bz, -1.5, 1.5);
    }
    this.steer(p, tx, tz, this.rand() < Math.max(k.turbo, 0.5), 0.1);
  }

  private offense(m: MatchState, p: PlayerSim, v: View): void {
    const k = this.skill;
    const team = p.team;
    const hx = hoopXOf(team);
    const s = attackSign(team);
    const d = hypot2(hx - p.x, p.z);
    const front = (hx - p.x) * s;
    const held = (this.tick - this.ballSince) * DT;
    const clockLow = m.shotClock < 2.5;
    const finish = canDunk(p) ? dunkRange(m, p) * 0.85 : LAYUP.range * 0.85;
    const lane = front > 0.5 && laneClear(m, team, p.x, p.z, hx - s * 0.6, 0, 0.8);
    // a random pass, the way a young player throws it to whoever
    if (this.rand() < k.randomPass) {
      this.pressB(0);
      return;
    }
    if (k.shotSense <= 0.01) {
      // run at the hoop, shoot once near enough or when tired of waiting
      this.steer(p, hx - s * 0.6, 0, this.rand() < k.turbo);
      if ((d < this.shootFrom && front > 0.3) || held > this.patience || clockLow) this.pressA(0, 4);
      return;
    }
    const contest = shotContest(m, p);
    const ev = makeProb(m, p, contest, 'good', 0) * (isThree(p.x, p.z, team) ? 3 : 2);
    // finishing at the rim
    if (d < finish && front > 0.3 && (lane || d < 2.2 || this.rand() > k.shotSense)) {
      this.steer(p, hx - s * 0.5, 0, true);
      this.pressA(0, 4);
      return;
    }
    if (clockLow || held > this.patience) {
      this.pressA(0, 4);
      return;
    }
    // open jumper from where they can shoot
    const inRange = d < shootingRange(p.attrs.shot) && front > 0.3;
    const want = 0.75 + 0.35 * k.shotSense;
    if (inRange && ev > want && contest < 0.55 - 0.25 * k.shotSense) {
      this.pressA(0, 4);
      return;
    }
    // drive when the lane is open
    if (lane && d < 9) {
      this.steer(p, hx - s * 0.6, p.z * 0.3, true);
      return;
    }
    // an open teammate
    if (this.rand() < k.passSense) {
      let best = -1;
      let bestOpen = 2.4;
      for (const q of m.players) {
        if (q.team !== team || q === p || q.state !== 'free') continue;
        const open = nearestOpponentDist(m, q.x, q.z, team);
        const qd = hypot2(hx - q.x, q.z);
        const val = open - (qd > 7 ? 1 : 0) + (qd < 2.6 ? 1 : 0);
        if (val > bestOpen) {
          bestOpen = val;
          best = q.idx;
        }
      }
      if (best >= 0 && contest > 0.25) {
        const q = m.players[best];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const l = hypot2(dx, dz) || 1;
        this.mx = dx / l;
        this.mz = dz / l;
        this.pressB(0);
        return;
      }
    }
    // shake the defender: a sharp cut the other way now and then
    if (k.jukes && this.jukeT <= this.tick && contest > 0.3 && hypot2(p.vx, p.vz) > 3.5) {
      this.jukeT = this.tick + Math.round(1.5 / DT);
      this.mx = -this.mx;
      this.mz = -this.mz;
      this.sprint = true;
      return;
    }
    // no lane, nobody open: work along the arc toward the middle, or attack anyway
    if (this.rand() < 0.45) {
      this.steer(p, hx - s * 0.6, 0, this.rand() < k.turbo);
    } else {
      const side = this.rand() < 0.5 ? -1 : 1;
      const r = Math.min(Math.max(4.5, d - 1), COURT.threeR - 0.4);
      const ang = clamp(Math.atan2(p.z, Math.max(0.1, front)) + side * 0.7, -1.3, 1.3);
      this.steer(p, hx - s * Math.cos(ang) * r, Math.sin(ang) * r, false);
    }
  }

  private defense(m: MatchState, p: PlayerSim, v: View): void {
    const k = this.skill;
    const opp = (1 - this.team) as TeamId;
    const hx = hoopXOf(opp);
    const handlerIdx = v.holder >= 0 && m.players[v.holder].team === opp ? v.holder : -1;
    const hs = handlerIdx >= 0 ? v.players[handlerIdx] : null;
    // take the defender nearest the ball when this one is out of the play
    if (k.switches && hs) {
      const mine = hypot2(p.x - hs.x, p.z - hs.z);
      let near = mine;
      for (const q of m.players) if (q.team === this.team && q !== p) near = Math.min(near, hypot2(q.x - hs.x, q.z - hs.z));
      if (mine > 5 && near < mine - 2 && this.pendingSw < 0) this.pendingSw = this.tick + 1;
    }
    if (this.rand() < k.chase || !hs) {
      const lead = k.anticipate;
      const tx = hs ? hs.x + hs.vx * lead : v.bx;
      const tz = hs ? hs.z + hs.vz * lead : v.bz;
      this.steer(p, tx, tz, this.rand() < Math.max(k.turbo, 0.55), 0.1);
    } else {
      // between the man and the hoop: the ball handler if near, otherwise the one this player marks
      let man = m.players[p.mark];
      if (!man || man.team === this.team) man = m.players[handlerIdx];
      const ms = v.players[man.idx];
      const mineToBall = hs ? hypot2(p.x - hs.x, p.z - hs.z) : 99;
      const guard = hs && (man.idx === handlerIdx || mineToBall < 3) ? hs : ms;
      const gx = guard.x + guard.vx * k.anticipate;
      const gz = guard.z + guard.vz * k.anticipate;
      const dx = hx - gx;
      const dz = -gz;
      const dl = hypot2(dx, dz) || 1;
      const gap = Math.min(k.gap, Math.max(0.4, dl - 0.6));
      this.steer(p, gx + (dx / dl) * gap, gz + (dz / dl) * gap, hypot2(gx - p.x, gz - p.z) > 2.5 && this.rand() < Math.max(k.turbo, 0.5), 0.15);
    }
  }

  /** Button presses that come straight from what is seen, not from a plan: swipes, and going up at a shot. */
  private reflexes(m: MatchState, p: PlayerSim): void {
    const k = this.skill;
    if (p.hasBall || m.possession === this.team || p.state !== 'free') return;
    const v = this.seen();
    const opp = (1 - this.team) as TeamId;
    // go up with a shooter close by
    for (const q of m.players) {
      if (q.team !== opp) continue;
      const qs = v.players[q.idx];
      const shooting = qs.state === 'shoot' || qs.state === 'layup' || qs.state === 'dunk';
      if (!shooting) continue;
      const key = q.idx * 100000 + Math.floor((this.tick * DT - qs.t) * 10);
      if (key === this.jumpedFor) continue;
      if (hypot2(qs.x - p.x, qs.z - p.z) < 1.9) {
        this.jumpedFor = key;
        if (this.rand() < k.contest) this.pressA(0, 3);
        return;
      }
    }
    const hi = m.ball.state === 'held' ? m.ball.holder : -1;
    if (hi >= 0 && m.players[hi].team === opp) {
      const hs = v.players[hi];
      const d = hypot2(hs.x - p.x, hs.z - p.z);
      if (d < k.swipeReach && this.rand() < k.swipeRate * DT) this.pressB(0);
      if (d < 3 && this.rand() < k.randomJump * DT) this.pressA(0, 3);
    } else if (m.ball.state === 'pass' && hypot2(m.ball.x - p.x, m.ball.z - p.z) < k.swipeReach && this.rand() < k.swipeRate * DT * 1.5) {
      this.pressB(0);
    }
  }
}
