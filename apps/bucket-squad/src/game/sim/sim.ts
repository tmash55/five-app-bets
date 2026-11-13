/**
 * The match simulation: a deterministic, fixed-step model of an arcade
 * basketball game. It knows nothing about rendering. `stepMatch` advances the
 * state by one tick and leaves the things that happened in `state.events`.
 */

import { aiIntent, aiReset, newAiMemory } from './ai';
import {
  BALL_R,
  COURT,
  DT,
  DUNK,
  G_BALL,
  G_JUMP,
  HYPE,
  JUMP,
  LAYUP,
  MOVE,
  PASS,
  PLAYER_R,
  RULES,
  SHOT,
  STEAL,
} from './constants';
import {
  attackSign,
  canDunk,
  distToHoop,
  dunkRange,
  heldBallPos,
  hoopXOf,
  hypeOn,
  isThree,
  laneClear,
  makeProb,
  nearestOpponent,
  newIntent,
  resetIntent,
  shotApexTime,
  shotContest,
  shotJumpV0,
} from './core';
import { approach, approachAngle, clamp, clamp01, hypot2, lerp, rngNext, smooth } from './math';
import type {
  BallSim,
  DunkStyle,
  Intent,
  MatchConfig,
  MatchState,
  PadInput,
  PlayerSim,
  PlayerStats,
  ShotGrade,
  SimEvent,
  TeamId,
} from './types';

const tmp = { x: 0, y: 0, z: 0 };
const scratchIntent: Intent = newIntent();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function newStats(): PlayerStats {
  return { points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, perfects: 0 };
}

function newBall(count: number): BallSim {
  return {
    state: 'held',
    x: 0,
    y: 1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    holder: 0,
    lastHolder: 0,
    shooter: -1,
    points: 2,
    planned: false,
    ghost: false,
    perfect: false,
    fromShot: false,
    shotTeam: 0,
    kind: 'jumper',
    afterBuzzer: false,
    fx: 0,
    fy: 0,
    fz: 0,
    to: -1,
    s: 0,
    passDur: 0.3,
    lob: 0,
    passer: -1,
    passTime: -99,
    checked: new Array<boolean>(count).fill(false),
    spin: 0,
    bounceT: 1,
    looseT: 0,
  };
}

export function createMatch(cfg: MatchConfig): MatchState {
  const perTeam = cfg.teams[0].players.length;
  const players: PlayerSim[] = [];
  for (let team = 0 as TeamId; team < 2; team = (team + 1) as TeamId) {
    for (let slot = 0; slot < perTeam; slot++) {
      const setup = cfg.teams[team].players[slot];
      players.push({
        idx: team * perTeam + slot,
        team,
        slot,
        id: setup.id,
        attrs: { ...setup.attrs },
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        y: 0,
        vy: 0,
        facing: team === 0 ? 0 : Math.PI,
        state: 'free',
        t: 0,
        dur: 0,
        hasBall: false,
        turbo: 1,
        turboLock: 0,
        sprinting: false,
        dribT: 0,
        hand: 1,
        handTarget: 1,
        mark: (1 - team) * perTeam + slot,
        sx: 0,
        sz: 0,
        ex: 0,
        ez: 0,
        ey: 0,
        style: 'twoHand',
        released: false,
        passTo: -1,
        relErr: 0,
        safeT: 0,
        stealCool: 0,
        pickupCool: 0,
        lastMx: 0,
        lastMz: 0,
        jukeCool: 0,
        catchT: 9,
        stumbleKind: 'bump',
        autoRelease: false,
        stealHit: false,
        celebrate: 0,
        handSwitchT: 0,
        ai: newAiMemory(),
      });
    }
    if (team === 1) break;
  }
  const m: MatchState = {
    cfg,
    rng: cfg.seed | 0 || 1,
    tick: 0,
    phase: 'countdown',
    phaseT: 0,
    quarter: 1,
    overtime: false,
    clock: cfg.quarterSeconds,
    shotClock: RULES.shotClock,
    score: [0, 0],
    possession: 0,
    inboundTeam: 0,
    players,
    ball: newBall(players.length),
    control: -1,
    hype: [0, 0],
    hypeT: [0, 0],
    stats: players.map(newStats),
    events: [],
    winner: -1,
    run: [0, 0],
    lastScoreT: [99, 99],
    lastScoreBy: -1,
    perTeam,
    padA: false,
    padB: false,
    padSw: false,
    ctrlKey: '',
    time: 0,
  };
  setupInbound(m, 0);
  m.phase = 'countdown';
  m.phaseT = 0;
  return m;
}

function emit(m: MatchState, e: SimEvent): void {
  m.events.push(e);
}

function teamPlayers(m: MatchState, team: TeamId): PlayerSim[] {
  return m.players.filter((p) => p.team === team);
}

/** Put both teams in place for the given team to bring the ball up. */
function setupInbound(m: MatchState, team: TeamId): void {
  const s = attackSign(team);
  const off = teamPlayers(m, team);
  const def = teamPlayers(m, (1 - team) as TeamId);
  // the best ball handler brings it up
  let handler = off[0];
  for (const p of off) if (p.attrs.handle + p.attrs.speed * 0.3 > handler.attrs.handle + handler.attrs.speed * 0.3) handler = p;
  const wings = off.filter((p) => p !== handler);
  const place = (p: PlayerSim, x: number, z: number, face: number) => {
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
    p.y = 0;
    p.vy = 0;
    p.facing = face;
    p.state = 'free';
    p.t = 0;
    p.hasBall = false;
    p.sprinting = false;
    p.released = false;
    p.safeT = 0.8;
    p.stealCool = 0;
    p.pickupCool = 0;
    p.catchT = 9;
    p.celebrate = 0;
    p.turbo = Math.max(p.turbo, 0.6);
    p.turboLock = 0;
    aiReset(p);
  };
  const faceOff = s > 0 ? 0 : Math.PI;
  const faceDef = s > 0 ? Math.PI : 0;
  place(handler, -s * 6.6, 0.4, faceOff);
  wings.forEach((p, i) => place(p, -s * 2.6, i === 0 ? -3.6 : 3.6, faceOff));
  // defenders match up by slot, the handler's man picks up first
  const handlerDef = def.find((d) => d.slot === handler.slot) ?? def[0];
  const others = def.filter((d) => d !== handlerDef);
  place(handlerDef, -s * 3.2, 0.2, faceDef);
  others.forEach((d, i) => place(d, s * 0.6, i === 0 ? -3.0 : 3.0, faceDef));
  // marks
  handlerDef.mark = handler.idx;
  handler.mark = handlerDef.idx;
  wings.forEach((w, i) => {
    const d = others[i];
    if (d) {
      d.mark = w.idx;
      w.mark = d.idx;
    }
  });
  const b = m.ball;
  b.state = 'held';
  b.holder = handler.idx;
  b.lastHolder = handler.idx;
  b.fromShot = false;
  b.ghost = false;
  b.passer = -1;
  b.vx = b.vy = b.vz = 0;
  handler.hasBall = true;
  // held at the chest until play starts
  handler.catchT = 0;
  heldBallPos(m, handler, tmp);
  b.x = tmp.x;
  b.y = tmp.y;
  b.z = tmp.z;
  m.possession = team;
  m.shotClock = RULES.shotClock;
  m.ctrlKey = '';
  if (m.cfg.userTeam >= 0) {
    m.control = team === m.cfg.userTeam ? handler.idx : nearestTo(m, m.cfg.userTeam as TeamId, handler.x, handler.z, -1);
  }
}

function nearestTo(m: MatchState, team: TeamId, x: number, z: number, skip: number): number {
  let best = -1;
  let bd = 1e9;
  for (const p of m.players) {
    if (p.team !== team || p.idx === skip) continue;
    const d = hypot2(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p.idx;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Possession, scoring, hype
// ---------------------------------------------------------------------------

function addHype(m: MatchState, team: TeamId, amount: number): void {
  if (m.hypeT[team] > 0) return;
  m.hype[team] = Math.min(HYPE.max, m.hype[team] + amount);
  if (m.hype[team] >= HYPE.max) {
    m.hypeT[team] = HYPE.duration;
    emit(m, { type: 'hype', team, on: true });
  }
}

function give(m: MatchState, p: PlayerSim): void {
  const b = m.ball;
  b.state = 'held';
  b.holder = p.idx;
  b.lastHolder = p.idx;
  b.fromShot = false;
  b.ghost = false;
  b.vx = p.vx;
  b.vz = p.vz;
  b.vy = 0;
  for (const q of m.players) q.hasBall = false;
  p.hasBall = true;
  p.safeT = Math.max(p.safeT, 0.3);
  if (m.possession !== p.team) {
    m.possession = p.team;
    m.shotClock = RULES.shotClock;
    b.passer = -1;
    for (const q of m.players) aiReset(q);
    assignMarks(m, p.team);
    emit(m, { type: 'possession', team: p.team });
  }
}

/** Match each defender to the nearest attacker, ball handler first. */
function assignMarks(m: MatchState, offTeam: TeamId): void {
  const hx = hoopXOf(offTeam);
  const off = teamPlayers(m, offTeam).sort((a, b) =>
    a.hasBall ? -1 : b.hasBall ? 1 : hypot2(hx - a.x, a.z) - hypot2(hx - b.x, b.z),
  );
  const free = teamPlayers(m, (1 - offTeam) as TeamId);
  for (const a of off) {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < free.length; i++) {
      const d = hypot2(free[i].x - a.x, free[i].z - a.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) break;
    const d = free.splice(best, 1)[0];
    d.mark = a.idx;
    a.mark = d.idx;
  }
}

function dropBall(m: MatchState, p: PlayerSim, vx: number, vy: number, vz: number): void {
  const b = m.ball;
  if (!p.hasBall) return;
  heldBallPos(m, p, tmp);
  b.x = tmp.x;
  b.y = Math.max(BALL_R, tmp.y);
  b.z = tmp.z;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  b.state = 'loose';
  b.looseT = 0;
  b.fromShot = false;
  b.ghost = false;
  b.holder = -1;
  p.hasBall = false;
  p.pickupCool = 0.55;
}

function scoreBasket(m: MatchState, team: TeamId, hoop: number): void {
  const b = m.ball;
  let scorer = b.fromShot && b.shooter >= 0 && m.players[b.shooter].team === team ? b.shooter : -1;
  let points = scorer >= 0 ? b.points : 2;
  if (scorer < 0) {
    // a deflection or a tip dropped in: credit the last player on that team to touch it
    const last = m.players[b.lastHolder];
    scorer = last && last.team === team ? last.idx : nearestTo(m, team, hoop * COURT.hoopX, 0, -1);
    points = 2;
  }
  const perfect = b.fromShot && b.perfect && b.shooter === scorer;
  const kind = b.fromShot ? b.kind : 'jumper';
  const buzzer = !m.overtime && m.clock <= 0;
  m.score[team] += points;
  const st = m.stats[scorer];
  st.points += points;
  st.fgm++;
  if (points === 3) st.tpm++;
  if (kind === 'dunk' || kind === 'oop') st.dunks++;
  let assist = -1;
  if (b.passer >= 0 && b.passer !== scorer && m.players[b.passer].team === team && m.time - b.passTime < 5 && b.to === scorer) {
    assist = b.passer;
    m.stats[assist].assists++;
  }
  m.run[team]++;
  m.run[1 - team] = 0;
  let gain: number = points === 3 ? HYPE.three : HYPE.two;
  if (kind === 'dunk') gain = HYPE.dunk;
  if (kind === 'oop') gain = HYPE.oop;
  if (perfect) gain += HYPE.perfect;
  addHype(m, team, gain);
  emit(m, { type: 'score', by: scorer, team, points, kind, perfect, buzzer, assist });
  m.lastScoreT[hoop > 0 ? 1 : 0] = 0;
  m.lastScoreBy = scorer;
  b.state = 'dead';
  b.fromShot = false;
  b.ghost = false;
  // the net slows it down
  b.vx *= 0.22;
  b.vz *= 0.22;
  b.vy = Math.max(b.vy, -5.2) * 0.65;
  m.inboundTeam = (1 - team) as TeamId;
  m.players[scorer].celebrate = 1.5;
  if (m.overtime) {
    finish(m);
  } else if (buzzer) {
    endPeriod(m);
  } else {
    m.phase = 'scored';
    m.phaseT = 0;
  }
}

function finish(m: MatchState): void {
  m.phase = 'final';
  m.phaseT = 0;
  m.winner = m.score[0] >= m.score[1] ? 0 : 1;
  emit(m, { type: 'final', winner: m.winner });
}

function endPeriod(m: MatchState): void {
  emit(m, { type: 'period', quarter: m.quarter, start: false, overtime: m.overtime });
  if (m.quarter >= m.cfg.quarters && m.score[0] !== m.score[1]) {
    finish(m);
    return;
  }
  m.phase = 'periodEnd';
  m.phaseT = 0;
}

function startNextPeriod(m: MatchState): void {
  if (m.quarter >= m.cfg.quarters) {
    // tied after regulation: next basket wins
    m.overtime = true;
    m.clock = 0;
  } else {
    m.clock = m.cfg.quarterSeconds;
  }
  m.quarter++;
  // possession alternates each period
  const team = (m.quarter % 2 === 1 ? 0 : 1) as TeamId;
  setupInbound(m, team);
  m.phase = 'countdown';
  m.phaseT = RULES.countdown - 1.6;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function enter(p: PlayerSim, state: PlayerSim['state'], dur = 0): void {
  p.state = state;
  p.t = 0;
  p.dur = dur;
  p.released = false;
}

function stumble(m: MatchState, p: PlayerSim, kind: PlayerSim['stumbleKind'], dur: number): void {
  if (p.hasBall) {
    const a = rngNext(m) * Math.PI * 2;
    dropBall(m, p, Math.cos(a) * 2.2, 3.2, Math.sin(a) * 2.2);
  }
  enter(p, 'stumble', dur);
  p.stumbleKind = kind;
  p.sprinting = false;
}

function gradeOf(m: MatchState, p: PlayerSim, err: number): ShotGrade {
  const win = p.idx === m.control ? m.cfg.timingAssist : 1;
  const a = Math.abs(err);
  if (a <= SHOT.perfectWin * win) return 'perfect';
  if (a <= SHOT.goodWin * win) return 'good';
  if (a <= SHOT.goodWin * win * 2.1) return 'ok';
  return 'bad';
}

/** Try to swat a shot at the moment it leaves the hand. Returns the blocker or null. */
function tryBlock(m: MatchState, p: PlayerSim, ballY: number, base: number): PlayerSim | null {
  const hx = hoopXOf(p.team);
  let dx = hx - p.x;
  let dz = -p.z;
  const dl = hypot2(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  for (const o of m.players) {
    if (o.team === p.team || o.state !== 'jump') continue;
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const d = hypot2(ox, oz);
    if (d > 1.4) continue;
    if (d > 0.2 && (ox * dx + oz * dz) / d < -0.1) continue; // behind the shooter
    if (o.y + JUMP.reachUp < ballY - 0.18) continue;
    if (o.vy < -5.5) continue; // already well on the way down
    let pr = base + 0.5 * o.attrs.block - 0.1 * p.attrs.shot;
    if (hypeOn(m, o.team)) pr += 0.12;
    if (o.idx === m.control) pr += 0.1;
    pr *= clamp01(1.25 - d / 1.4);
    if (rngNext(m) < clamp(pr, 0.03, 0.85)) return o;
  }
  return null;
}

function blockBall(m: MatchState, shooter: PlayerSim, blocker: PlayerSim, x: number, y: number, z: number, stuffed: boolean): void {
  const b = m.ball;
  const hx = hoopXOf(shooter.team);
  let dx = shooter.x - hx;
  let dz = shooter.z;
  const dl = hypot2(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const a = (rngNext(m) - 0.5) * 1.6;
  const cx = dx * Math.cos(a) - dz * Math.sin(a);
  const cz = dx * Math.sin(a) + dz * Math.cos(a);
  b.state = 'loose';
  b.looseT = 0;
  b.fromShot = false;
  b.ghost = false;
  b.holder = -1;
  b.lastHolder = blocker.idx;
  b.x = x;
  b.y = y;
  b.z = z;
  const sp = 5.5 + rngNext(m) * 3;
  b.vx = cx * sp;
  b.vz = cz * sp;
  b.vy = 2.5 + rngNext(m) * 2.5;
  shooter.hasBall = false;
  shooter.pickupCool = 0.5;
  m.stats[blocker.idx].blocks++;
  addHype(m, blocker.team, HYPE.block);
  emit(m, { type: 'block', by: blocker.idx, on: shooter.idx, stuffed });
}

function launchShot(
  m: MatchState,
  p: PlayerSim,
  made: boolean,
  three: boolean,
  perfect: boolean,
  kind: BallSim['kind'],
  flightT: number,
): void {
  const b = m.ball;
  heldBallPos(m, p, tmp);
  const x0 = tmp.x;
  const y0 = tmp.y;
  const z0 = tmp.z;
  const hx = hoopXOf(p.team);
  const dx = hx - x0;
  const dz = -z0;
  const d = hypot2(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  const px = -uz;
  const pz = ux;
  let tx = hx;
  let ty = COURT.rimY;
  let tz = 0;
  if (made) {
    const j = (rngNext(m) - 0.5) * 0.14;
    const k = (rngNext(m) - 0.5) * 0.1;
    tx += ux * k + px * j;
    tz += uz * k + pz * j;
    ty = COURT.rimY + 0.02;
  } else {
    const r = rngNext(m);
    if (r < 0.4) {
      const off = -(COURT.rimR + 0.015 + rngNext(m) * 0.05);
      tx += ux * off;
      tz += uz * off;
      ty = COURT.rimY + BALL_R * 0.55;
    } else if (r < 0.74) {
      const off = COURT.rimR + 0.05 + rngNext(m) * 0.07;
      tx += ux * off;
      tz += uz * off;
      ty = COURT.rimY + BALL_R * 0.45;
    } else if (r < 0.9) {
      const side = rngNext(m) < 0.5 ? 1 : -1;
      const off = COURT.rimR + 0.035;
      tx += px * side * off;
      tz += pz * side * off;
      ty = COURT.rimY + BALL_R * 0.5;
    } else if (r < 0.96) {
      const off = -(0.75 + rngNext(m) * 0.5);
      tx += ux * off;
      tz += uz * off;
      ty = COURT.rimY - 0.1;
    } else {
      tx += ux * 0.5;
      tz += uz * 0.5;
      ty = COURT.rimY + 0.7;
    }
  }
  const dd = hypot2(tx - x0, tz - z0);
  const T = flightT > 0 ? flightT : clamp(0.6 + 0.05 * dd + (rngNext(m) - 0.5) * 0.04, 0.42, 1.5);
  b.x = x0;
  b.y = y0;
  b.z = z0;
  b.vx = (tx - x0) / T;
  b.vz = (tz - z0) / T;
  b.vy = (ty - y0 + 0.5 * G_BALL * T * T) / T;
  b.state = 'shot';
  b.holder = -1;
  b.lastHolder = p.idx;
  b.shooter = p.idx;
  b.points = three ? 3 : 2;
  b.planned = made;
  b.ghost = made;
  b.perfect = perfect;
  b.fromShot = true;
  b.shotTeam = p.team;
  b.kind = kind;
  b.afterBuzzer = false;
  p.hasBall = false;
  p.pickupCool = 0.35;
}

function releaseShot(m: MatchState, p: PlayerSim, err: number, forced: ShotGrade | null): void {
  p.released = true;
  p.relErr = err;
  const grade = forced ?? gradeOf(m, p, err);
  const contest = shotContest(m, p);
  const three = isThree(p.x, p.z, p.team);
  const st = m.stats[p.idx];
  st.fga++;
  if (three) st.tpa++;
  if (grade === 'perfect') st.perfects++;
  emit(m, { type: 'shot', by: p.idx, three, grade, contest });
  heldBallPos(m, p, tmp);
  const blocker = tryBlock(m, p, tmp.y, grade === 'perfect' ? 0.08 : 0.2);
  if (blocker) {
    blockBall(m, p, blocker, tmp.x, tmp.y, tmp.z, false);
    return;
  }
  const s = attackSign(p.team);
  const behindBoard = (hoopXOf(p.team) - p.x) * s < 0.1;
  const prob = makeProb(m, p, contest, grade, hypot2(p.vx, p.vz));
  const made = !behindBoard && rngNext(m) < prob;
  launchShot(m, p, made, three, grade === 'perfect', 'jumper', 0);
}

function startShot(m: MatchState, p: PlayerSim): void {
  enter(p, 'shoot');
  p.autoRelease = false;
  p.vy = 0;
  if (p.idx !== m.control) {
    // computer players pick their release time up front
    p.ai.releaseAt = shotApexTime() + p.ai.releaseAt;
  }
}

function pickDunkStyle(m: MatchState, p: PlayerSim, d: number): DunkStyle {
  const r = rngNext(m);
  const fancy = p.attrs.dunk + (hypeOn(m, p.team) ? 0.25 : 0);
  if (fancy > 0.72 && d > 2.2) {
    if (r < 0.3) return 'windmill';
    if (r < 0.55) return 'spin';
    return r < 0.8 ? 'tomahawk' : 'twoHand';
  }
  if (fancy > 0.5) {
    if (r < 0.22 && d > 2.2) return 'windmill';
    return r < 0.65 ? 'tomahawk' : 'twoHand';
  }
  return r < 0.4 ? 'tomahawk' : 'twoHand';
}

/** Work out where a dunk ends: just in front of the rim, on the court side of the board. */
function setDunkPath(p: PlayerSim): number {
  const s = attackSign(p.team);
  const hx = hoopXOf(p.team);
  let dx = hx - p.x;
  let dz = -p.z;
  const d = hypot2(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // never approach from behind the backboard
  if (dx * s < 0.35) {
    dx = 0.35 * s;
    const zs = dz === 0 ? 1 : Math.sign(dz);
    dz = zs * Math.sqrt(1 - 0.35 * 0.35);
  }
  p.sx = p.x;
  p.sz = p.z;
  p.ex = hx - dx * DUNK.endBack;
  p.ez = -dz * DUNK.endBack;
  p.ey = COURT.rimY + 0.12 - DUNK.handUp;
  p.facing = Math.atan2(dz, dx);
  return d;
}

function startDunk(m: MatchState, p: PlayerSim): void {
  const d = setDunkPath(p);
  enter(p, 'dunk', clamp(0.4 + 0.115 * d, 0.5, 0.95));
  p.style = pickDunkStyle(m, p, d);
  if (p.style === 'windmill' || p.style === 'spin') p.dur = Math.max(p.dur, 0.74);
  p.sprinting = false;
  emit(m, { type: 'dunkStart', by: p.idx, style: p.style, oop: false });
}

function startOop(m: MatchState, p: PlayerSim, dur: number): void {
  setDunkPath(p);
  enter(p, 'oop', dur);
  p.style = rngNext(m) < 0.5 ? 'twoHand' : 'tomahawk';
  p.sprinting = false;
  emit(m, { type: 'dunkStart', by: p.idx, style: p.style, oop: true });
}

function startLayup(m: MatchState, p: PlayerSim): void {
  const hx = hoopXOf(p.team);
  const s = attackSign(p.team);
  let dx = hx - p.x;
  let dz = -p.z;
  const d = hypot2(dx, dz) || 1;
  dx /= d;
  dz /= d;
  if (dx * s < 0.2) {
    dx = 0.2 * s;
    dz = (dz === 0 ? 1 : Math.sign(dz)) * Math.sqrt(1 - 0.04);
  }
  const back = Math.min(LAYUP.endBack, Math.max(0.55, d - 0.2));
  enter(p, 'layup', LAYUP.dur);
  p.sx = p.x;
  p.sz = p.z;
  p.ex = hx - dx * back;
  p.ez = -dz * back;
  p.facing = Math.atan2(dz, dx);
  p.sprinting = false;
}

function startShotOrFinish(m: MatchState, p: PlayerSim): void {
  const s = attackSign(p.team);
  const hx = hoopXOf(p.team);
  const dx = hx - p.x;
  const dz = -p.z;
  const d = hypot2(dx, dz);
  const sp = hypot2(p.vx, p.vz);
  const toward = sp > 0.6 && d > 1e-3 ? (p.vx * dx + p.vz * dz) / (sp * d) : 0;
  const inFront = dx * s > 0.3;
  if (inFront && d > 0.45) {
    const range = dunkRange(m, p);
    const far = d > 2.3;
    // a defender planted in the runway turns a dunk into a layup
    const k = Math.max(0, d - 0.95) / d;
    const runway = hypeOn(m, p.team) || laneClear(m, p.team, p.x, p.z, p.x + dx * k, p.z + dz * k, 0.48);
    if (runway && canDunk(p) && d < range && (toward > 0.25 || d < 1.7) && (!far || p.sprinting || hypeOn(m, p.team) || toward > 0.75)) {
      startDunk(m, p);
      return;
    }
    if (d < LAYUP.range && (toward > 0.15 || d < 1.6)) {
      startLayup(m, p);
      return;
    }
  }
  startShot(m, p);
}

function releaseLayup(m: MatchState, p: PlayerSim): void {
  p.released = true;
  const contest = shotContest(m, p);
  const st = m.stats[p.idx];
  st.fga++;
  emit(m, { type: 'shot', by: p.idx, three: false, grade: 'good', contest });
  heldBallPos(m, p, tmp);
  const blocker = tryBlock(m, p, tmp.y, 0.1);
  if (blocker) {
    blockBall(m, p, blocker, tmp.x, tmp.y, tmp.z, false);
    return;
  }
  let prob = 0.76 + 0.2 * (0.6 * p.attrs.dunk + 0.4 * p.attrs.shot) - contest * 0.33;
  if (hypeOn(m, p.team)) prob += 0.08;
  const diff = clamp(m.score[p.team] - m.score[1 - p.team], -12, 12) / 12;
  prob -= diff * 0.05 * m.cfg.rubberBand;
  const made = rngNext(m) < clamp(prob, 0.08, 0.97);
  launchShot(m, p, made, false, false, 'layup', 0.36);
}

function resolveDunk(m: MatchState, p: PlayerSim): void {
  p.released = true;
  const oop = p.state === 'oop';
  const hx = hoopXOf(p.team);
  const hoop = attackSign(p.team);
  if (!p.hasBall) {
    // an alley-oop that never arrived
    enter(p, 'jump');
    p.vy = 0;
    return;
  }
  // stuffed at the rim?
  for (const o of m.players) {
    if (o.team === p.team || o.state !== 'jump') continue;
    if (hypot2(o.x - hx, o.z) > 1.15) continue;
    if (o.y + JUMP.reachUp < COURT.rimY - 0.05) continue;
    let pr = 0.16 + 0.5 * o.attrs.block - 0.3 * p.attrs.dunk;
    if (hypeOn(m, p.team)) pr -= 0.1;
    if (o.idx === m.control) pr += 0.12;
    if (rngNext(m) < clamp(pr, 0.02, 0.5)) {
      m.stats[p.idx].fga++;
      heldBallPos(m, p, tmp);
      blockBall(m, p, o, tmp.x, tmp.y, tmp.z, true);
      enter(p, 'stumble', 0.75);
      p.stumbleKind = 'stuffed';
      return;
    }
  }
  const b = m.ball;
  m.stats[p.idx].fga++;
  b.x = hx;
  b.y = COURT.rimY - 0.04;
  b.z = 0;
  b.vx = 0;
  b.vz = 0;
  b.vy = -7;
  b.holder = -1;
  b.shooter = p.idx;
  b.points = 2;
  b.fromShot = true;
  b.perfect = false;
  b.kind = oop ? 'oop' : 'dunk';
  b.shotTeam = p.team;
  p.hasBall = false;
  // anyone standing under it gets put on a poster
  let victim: PlayerSim | null = null;
  let vd = 0.95;
  for (const o of m.players) {
    if (o.team === p.team) continue;
    if (o.state === 'stumble' || o.state === 'hang') continue;
    const od = hypot2(o.x - hx, o.z);
    if (od < vd) {
      vd = od;
      victim = o;
    }
  }
  if (victim) {
    stumble(m, victim, 'poster', 0.7);
    victim.y = Math.min(victim.y, 0.6);
    emit(m, { type: 'poster', by: p.idx, victim: victim.idx });
  }
  enter(p, 'hang', DUNK.hang + (p.style === 'twoHand' ? 0.12 : 0));
  scoreBasket(m, p.team, hoop);
}

function startPass(m: MatchState, p: PlayerSim, to: number): void {
  p.passTo = to;
  if (p.state === 'shoot') {
    // a jump pass leaves straight away
    releasePass(m, p);
    return;
  }
  enter(p, 'pass', PASS.dur);
}

function oopReady(m: MatchState, mate: PlayerSim): boolean {
  if (mate.state !== 'free' || !canDunk(mate) || mate.y > 0) return false;
  const hx = hoopXOf(mate.team);
  const s = attackSign(mate.team);
  const dx = hx - mate.x;
  const d = hypot2(dx, mate.z);
  if (d > 4.3 || d < 0.9 || dx * s < 0.4) return false;
  const sp = hypot2(mate.vx, mate.vz);
  const toward = sp > 1.5 ? (mate.vx * dx + mate.vz * -mate.z) / (sp * d) : 0;
  if (toward < 0.45 && d > 2.2) return false;
  // nobody camped under the rim
  for (const o of m.players) {
    if (o.team === mate.team || o.state === 'stumble') continue;
    if (hypot2(o.x - hx, o.z) < 0.85) return false;
  }
  return true;
}

function releasePass(m: MatchState, p: PlayerSim): void {
  const b = m.ball;
  const r = m.players[p.passTo];
  p.released = true;
  if (!p.hasBall || !r) return;
  heldBallPos(m, p, tmp);
  b.fx = tmp.x;
  b.fy = tmp.y;
  b.fz = tmp.z;
  b.x = tmp.x;
  b.y = tmp.y;
  b.z = tmp.z;
  const dist = hypot2(r.x - p.x, r.z - p.z);
  const lobOop = oopReady(m, r) && rngNext(m) < (p.idx === m.control || r.idx === m.control ? 1 : 0.75);
  if (lobOop) {
    const dur = clamp(dist / 10.5, 0.5, 0.82);
    b.passDur = dur;
    b.lob = 1.1 + dist * 0.06;
    startOop(m, r, dur + 0.11);
  } else {
    const speed = PASS.speed + PASS.speedBonus * p.attrs.handle;
    b.passDur = Math.max(0.13, dist / speed);
    b.lob = dist > 7 ? 0.5 + (dist - 7) * 0.16 : 0.12;
  }
  b.state = 'pass';
  b.holder = -1;
  b.lastHolder = p.idx;
  b.to = r.idx;
  b.s = 0;
  b.passer = p.idx;
  b.passTime = m.time;
  b.fromShot = false;
  b.checked.fill(false);
  p.hasBall = false;
  p.pickupCool = 0.3;
  emit(m, { type: 'pass', by: p.idx, to: r.idx, lob: lobOop });
}

function choosePassTarget(m: MatchState, p: PlayerSim, it: Intent): number {
  if (it.passTo >= 0) return it.passTo;
  const len = hypot2(it.mx, it.mz);
  const hasDir = len > 0.35;
  const hx = hoopXOf(p.team);
  let best = -1;
  let bestScore = -1e9;
  for (const q of m.players) {
    if (q.team !== p.team || q === p) continue;
    if (q.state === 'stumble') continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = hypot2(dx, dz) || 1;
    let score: number;
    if (hasDir) {
      score = ((dx * it.mx + dz * it.mz) / (d * len)) * 3 - d * 0.03;
    } else {
      // no direction: the teammate in the best spot
      let open = 9;
      for (const o of m.players) if (o.team !== p.team) open = Math.min(open, hypot2(o.x - q.x, o.z - q.z));
      score = Math.min(2.5, open) - hypot2(hx - q.x, q.z) * 0.12 - d * 0.02;
    }
    if (score > bestScore) {
      bestScore = score;
      best = q.idx;
    }
  }
  return best;
}

function startJump(m: MatchState, p: PlayerSim): void {
  enter(p, 'jump');
  let apex = lerp(JUMP.apexMin, JUMP.apexMax, 0.45 * p.attrs.block + 0.55 * p.attrs.dunk);
  if (hypeOn(m, p.team)) apex *= 1.12;
  p.vy = Math.sqrt(2 * G_JUMP * apex);
  p.sprinting = false;
  emit(m, { type: 'jump', by: p.idx });
}

function startSteal(m: MatchState, p: PlayerSim): void {
  enter(p, 'steal', STEAL.dur);
  p.stealHit = false;
  p.sprinting = false;
  const b = m.ball;
  // lunge at the ball when it is close, otherwise straight ahead
  let ax = Math.cos(p.facing);
  let az = Math.sin(p.facing);
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = hypot2(dx, dz);
  if (d < 2.4 && d > 0.05) {
    ax = dx / d;
    az = dz / d;
    p.facing = Math.atan2(az, ax);
  }
  p.vx = p.vx * 0.5 + ax * STEAL.lunge;
  p.vz = p.vz * 0.5 + az * STEAL.lunge;
  emit(m, { type: 'swipe', by: p.idx });
}

function stealCheck(m: MatchState, p: PlayerSim): void {
  const b = m.ball;
  if (b.state !== 'held') return;
  const h = m.players[b.holder];
  if (h.team === p.team) return;
  const dx = h.x - p.x;
  const dz = h.z - p.z;
  const d = hypot2(dx, dz);
  if (d > STEAL.reach) return;
  const fd = d > 1e-3 ? (dx * Math.cos(p.facing) + dz * Math.sin(p.facing)) / d : 1;
  if (fd < 0.1) return;
  p.released = true;
  if (h.safeT > 0 || h.state === 'dunk' || h.state === 'oop' || h.state === 'hang' || h.y > 0.75) return;
  let pr = 0.1 + 0.42 * p.attrs.steal - 0.28 * h.attrs.handle;
  if (h.state === 'shoot' && h.t < SHOT.crouch + 0.08) pr += 0.12;
  if (h.sprinting) pr += 0.04;
  if (hypeOn(m, p.team)) pr += 0.1;
  if (p.idx === m.control) pr += 0.07;
  const diff = clamp(m.score[p.team] - m.score[1 - p.team], -12, 12) / 12;
  pr -= diff * 0.05 * m.cfg.rubberBand;
  if (rngNext(m) >= clamp(pr, 0.04, 0.72)) {
    h.safeT = STEAL.immunity;
    return;
  }
  p.stealHit = true;
  m.stats[p.idx].steals++;
  addHype(m, p.team, HYPE.steal);
  emit(m, { type: 'steal', by: p.idx, from: h.idx, intercept: false });
  if (rngNext(m) < 0.65) {
    h.hasBall = false;
    h.pickupCool = 0.5;
    give(m, p);
  } else {
    const k = d > 1e-3 ? 1 / d : 0;
    dropBall(m, h, -dx * k * 2.6 + (rngNext(m) - 0.5) * 2, 3, -dz * k * 2.6 + (rngNext(m) - 0.5) * 2);
    m.ball.lastHolder = p.idx;
  }
  if (h.state === 'free') enter(h, 'recover', 0.25);
}

function clampToCourt(p: PlayerSim): void {
  const lx = COURT.halfL + COURT.apron - PLAYER_R;
  const lz = COURT.halfW + COURT.apron - PLAYER_R;
  if (p.x > lx) {
    p.x = lx;
    if (p.vx > 0) p.vx = 0;
  } else if (p.x < -lx) {
    p.x = -lx;
    if (p.vx < 0) p.vx = 0;
  }
  if (p.z > lz) {
    p.z = lz;
    if (p.vz > 0) p.vz = 0;
  } else if (p.z < -lz) {
    p.z = -lz;
    if (p.vz < 0) p.vz = 0;
  }
}

function moveFree(m: MatchState, p: PlayerSim, it: Intent, factor: number): void {
  let mx = it.mx;
  let mz = it.mz;
  const l = hypot2(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  const hot = hypeOn(m, p.team);
  const wantSprint = it.turbo && l > 0.3 && p.turboLock <= 0 && (p.turbo > 0.02 || hot);
  p.sprinting = wantSprint;
  if (wantSprint && !hot) {
    p.turbo -= MOVE.turboDrain * DT;
    if (p.turbo <= 0) {
      p.turbo = 0;
      p.turboLock = 0.9;
    }
  } else if (!wantSprint) {
    p.turbo = Math.min(1, p.turbo + MOVE.turboFill * DT * (l < 0.1 ? 1.4 : 1));
  }
  let max = lerp(MOVE.speedMin, MOVE.speedMax, p.attrs.speed) * factor;
  if (p.sprinting) max *= MOVE.turboMult;
  if (p.hasBall) max *= MOVE.ballMult;
  if (hot) max *= MOVE.hypeMult;
  const tvx = mx * max;
  const tvz = mz * max;
  const dvx = tvx - p.vx;
  const dvz = tvz - p.vz;
  const dl = hypot2(dvx, dvz);
  const rate = (l > 0.05 ? MOVE.accel : MOVE.decel) * DT;
  if (dl <= rate) {
    p.vx = tvx;
    p.vz = tvz;
  } else {
    p.vx += (dvx / dl) * rate;
    p.vz += (dvz / dl) * rate;
  }
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  clampToCourt(p);
  // facing
  const sp = hypot2(p.vx, p.vz);
  const b = m.ball;
  let want = p.facing;
  const defending = m.possession !== p.team && (b.state === 'held' || b.state === 'pass');
  if (defending && !p.sprinting) {
    want = Math.atan2(b.z - p.z, b.x - p.x);
  } else if (sp > 0.8) {
    want = Math.atan2(p.vz, p.vx);
  } else if (p.hasBall) {
    want = Math.atan2(-p.z, hoopXOf(p.team) - p.x);
  } else if (b.state !== 'dead') {
    want = Math.atan2(b.z - p.z, b.x - p.x);
  }
  p.facing = approachAngle(p.facing, want, MOVE.turn * DT);
  const bounces = Math.floor(p.dribT);
  p.dribT += DT * (2.1 + sp * 0.2);
  // the ball meets the floor each time the cycle rolls over
  if (p.hasBall && Math.floor(p.dribT) !== bounces && m.phase === 'live' && b.state === 'held' && p.state === 'free' && p.catchT >= 0.22) emit(m, { type: 'dribble', by: p.idx });
}

function updateHand(m: MatchState, p: PlayerSim): void {
  p.handSwitchT -= DT;
  const o = nearestOpponent(m, p);
  if (o && p.handSwitchT <= 0) {
    const rx = -Math.sin(p.facing);
    const rz = Math.cos(p.facing);
    const side = (o.x - p.x) * rx + (o.z - p.z) * rz;
    const d = hypot2(o.x - p.x, o.z - p.z);
    if (d < 2.6 && Math.abs(side) > 0.3) {
      const want = side > 0 ? -1 : 1;
      if (want !== p.handTarget) {
        p.handTarget = want;
        p.handSwitchT = 0.55;
      }
    }
  }
  p.hand = approach(p.hand, p.handTarget, 11 * DT);
}

/** A sharp cut with the ball can send a wrong-footed defender sliding. */
function jukeCheck(m: MatchState, p: PlayerSim, it: Intent): void {
  const l = hypot2(it.mx, it.mz);
  const pl = hypot2(p.lastMx, p.lastMz);
  if (p.jukeCool <= 0 && l > 0.6 && pl > 0.6 && hypot2(p.vx, p.vz) > 3.5) {
    const dot = (it.mx * p.lastMx + it.mz * p.lastMz) / (l * pl);
    if (dot < -0.15) {
      p.jukeCool = 2;
      p.handTarget = -p.handTarget;
      p.handSwitchT = 0.5;
      const o = nearestOpponent(m, p);
      if (o && o.state === 'free' && hypot2(o.x - p.x, o.z - p.z) < 1.45) {
        // the defender has to be moving the old way to get caught
        const os = hypot2(o.vx, o.vz);
        const wrong = os > 1.8 && (o.vx * it.mx + o.vz * it.mz) / (os * l) < 0.1;
        if (wrong) {
          let pr = 0.08 + 0.5 * p.attrs.handle - 0.3 * o.attrs.steal;
          if (o.idx === m.control) pr *= 0.4;
          if (p.idx !== m.control) pr *= 0.6;
          if (hypeOn(m, p.team)) pr += 0.15;
          if (rngNext(m) < clamp(pr, 0.03, 0.7)) {
            stumble(m, o, 'ankle', 0.95);
            addHype(m, p.team, HYPE.ankle);
            emit(m, { type: 'ankle', by: p.idx, victim: o.idx });
          }
        }
      }
    }
  }
  // remember the stick with a little lag
  const k = 0.16;
  p.lastMx += (it.mx - p.lastMx) * k;
  p.lastMz += (it.mz - p.lastMz) * k;
}

function stepPlayer(m: MatchState, p: PlayerSim, it: Intent, live: boolean): void {
  p.t += DT;
  if (p.safeT > 0) p.safeT -= DT;
  if (p.stealCool > 0) p.stealCool -= DT;
  if (p.pickupCool > 0) p.pickupCool -= DT;
  if (p.jukeCool > 0) p.jukeCool -= DT;
  if (p.turboLock > 0) p.turboLock -= DT;
  if (p.celebrate > 0) p.celebrate -= DT;
  p.catchT += DT;
  switch (p.state) {
    case 'free': {
      if (live) {
        if (p.hasBall) {
          if (it.shootPress) {
            startShotOrFinish(m, p);
            return;
          }
          if (it.pass) {
            const to = choosePassTarget(m, p, it);
            if (to >= 0) {
              startPass(m, p, to);
              return;
            }
          }
        } else {
          if (it.jump) {
            startJump(m, p);
            return;
          }
          if (it.steal && p.stealCool <= 0) {
            startSteal(m, p);
            return;
          }
        }
      }
      moveFree(m, p, it, 1);
      if (p.hasBall) {
        updateHand(m, p);
        if (live) jukeCheck(m, p, it);
      }
      return;
    }
    case 'shoot': {
      const tA = shotApexTime();
      p.vx *= 0.93;
      p.vz *= 0.93;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      clampToCourt(p);
      p.facing = approachAngle(p.facing, Math.atan2(-p.z, hoopXOf(p.team) - p.x), 22 * DT);
      p.sprinting = false;
      if (p.t >= SHOT.crouch) {
        const tt = p.t - SHOT.crouch;
        p.y = Math.max(0, shotJumpV0() * tt - 0.5 * G_JUMP * tt * tt);
      }
      if (!p.released && p.hasBall) {
        if (it.pass) {
          const to = choosePassTarget(m, p, it);
          if (to >= 0) startPass(m, p, to);
        } else if (p.autoRelease) {
          if (p.t >= tA) releaseShot(m, p, 0, 'ok');
        } else if (!it.shoot && p.t < SHOT.crouch + 0.05) {
          // a quick tap: let the jump finish and shoot at the top
          p.autoRelease = true;
        } else if (!it.shoot) {
          releaseShot(m, p, p.t - tA, null);
        } else if (p.t >= tA + SHOT.lateAuto) {
          releaseShot(m, p, p.t - tA, null);
        }
      }
      if (p.t > SHOT.crouch + 0.06 && p.y <= 0) {
        p.y = 0;
        emit(m, { type: 'land', by: p.idx, hard: false });
        enter(p, 'recover', 0.08);
      }
      return;
    }
    case 'layup': {
      const u = clamp01(p.t / p.dur);
      const nx = lerp(p.sx, p.ex, u);
      const nz = lerp(p.sz, p.ez, u);
      p.vx = (nx - p.x) / DT;
      p.vz = (nz - p.z) / DT;
      p.x = nx;
      p.z = nz;
      p.y = LAYUP.apex * Math.sin(Math.PI * u);
      if (!p.released && u >= LAYUP.releaseU && p.hasBall) releaseLayup(m, p);
      if (p.t >= p.dur) {
        p.y = 0;
        p.vx *= 0.4;
        p.vz *= 0.4;
        emit(m, { type: 'land', by: p.idx, hard: false });
        enter(p, 'recover', 0.07);
      }
      return;
    }
    case 'dunk':
    case 'oop': {
      const u = clamp01(p.t / p.dur);
      const e = 1 - Math.pow(1 - u, 1.5);
      const nx = lerp(p.sx, p.ex, e);
      const nz = lerp(p.sz, p.ez, e);
      p.vx = (nx - p.x) / DT;
      p.vz = (nz - p.z) / DT;
      p.x = nx;
      p.z = nz;
      const bump = DUNK.bump * (hypeOn(m, p.team) ? 1.6 : 1);
      p.y = p.ey * smooth(Math.min(1, u * 1.18)) + bump * Math.sin(Math.PI * u);
      const base = Math.atan2(p.ez - p.sz, p.ex - p.sx);
      p.facing = p.style === 'spin' ? base + Math.PI * 2 * smooth(u / 0.86) : base;
      if (p.t >= p.dur && !p.released) resolveDunk(m, p);
      return;
    }
    case 'hang': {
      p.vx = 0;
      p.vz = 0;
      if (p.t >= p.dur) {
        enter(p, 'jump');
        p.vy = -0.5;
        const s = attackSign(p.team);
        p.vx = -s * 1.2;
      }
      return;
    }
    case 'pass': {
      moveFree(m, p, it, 0.4);
      if (!p.released && p.t >= PASS.windup) releasePass(m, p);
      if (p.t >= p.dur) enter(p, 'free');
      return;
    }
    case 'steal': {
      p.vx *= 0.9;
      p.vz *= 0.9;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      clampToCourt(p);
      if (live && !p.released && p.t >= STEAL.activeFrom && p.t <= STEAL.activeTo) stealCheck(m, p);
      if (p.t >= p.dur) {
        p.stealCool = STEAL.cooldown;
        enter(p, 'recover', p.stealHit ? 0.05 : 0.2);
      }
      return;
    }
    case 'jump': {
      p.vy -= G_JUMP * DT;
      p.y += p.vy * DT;
      p.vx = p.vx * 0.985 + it.mx * 5 * DT;
      p.vz = p.vz * 0.985 + it.mz * 5 * DT;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      clampToCourt(p);
      if (p.y <= 0 && p.vy < 0) {
        const hard = p.vy < -7.5;
        p.y = 0;
        p.vy = 0;
        emit(m, { type: 'land', by: p.idx, hard });
        enter(p, 'recover', JUMP.land);
      }
      return;
    }
    case 'stumble': {
      p.vx *= 0.88;
      p.vz *= 0.88;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      if (p.y > 0) {
        p.vy -= G_JUMP * DT;
        p.y = Math.max(0, p.y + p.vy * DT);
      }
      clampToCourt(p);
      if (p.t >= p.dur) enter(p, 'free');
      return;
    }
    case 'recover': {
      moveFree(m, p, it, 0.45);
      if (p.t >= p.dur) enter(p, 'free');
      return;
    }
    case 'celebrate': {
      p.vx *= 0.85;
      p.vz *= 0.85;
      if (p.t >= p.dur) enter(p, 'free');
      return;
    }
  }
}

function airborne(p: PlayerSim): boolean {
  return p.y > 0.6 || p.state === 'dunk' || p.state === 'oop' || p.state === 'hang' || p.state === 'layup';
}

function separatePlayers(m: MatchState): void {
  const ps = m.players;
  const min = PLAYER_R * 1.85;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (airborne(a)) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (airborne(b)) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = hypot2(dx, dz);
      if (d >= min) continue;
      if (d < 1e-4) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      const nx = dx / d;
      const nz = dz / d;
      const push = min - d;
      // a set defender is a wall: the dribbler has to go round (turbo leans on them a bit)
      let wa = 0.5;
      if (a.team !== b.team) {
        const h = a.hasBall ? a : b.hasBall ? b : null;
        if (h) {
          const o = h === a ? b : a;
          const set = o.state === 'free' || o.state === 'recover';
          const share = !set ? 0.3 : h.sprinting ? 0.68 : 0.85;
          wa = h === a ? share : 1 - share;
          if (set) {
            const sgn = h === a ? 1 : -1;
            const into = (h.vx * nx + h.vz * nz) * sgn;
            if (into > 0) {
              const cut = into * (h.sprinting ? 0.6 : 0.9);
              h.vx -= nx * sgn * cut;
              h.vz -= nz * sgn * cut;
            }
          }
        }
      }
      a.x -= nx * push * wa;
      a.z -= nz * push * wa;
      b.x += nx * push * (1 - wa);
      b.z += nz * push * (1 - wa);
    }
  }
  for (const p of ps) clampToCourt(p);
}

// ---------------------------------------------------------------------------
// Ball
// ---------------------------------------------------------------------------

function canCatch(p: PlayerSim): boolean {
  return p.state === 'free' || p.state === 'recover' || p.state === 'jump' || p.state === 'oop' || p.state === 'pass';
}

function stepPass(m: MatchState): void {
  const b = m.ball;
  const r = m.players[b.to];
  b.s += DT / b.passDur;
  let cx: number;
  let cy: number;
  let cz: number;
  if (r.state === 'oop') {
    heldBallPos(m, r, tmp);
    cx = tmp.x;
    cy = tmp.y;
    cz = tmp.z;
  } else {
    cx = r.x + Math.cos(r.facing) * 0.2;
    cz = r.z + Math.sin(r.facing) * 0.2;
    cy = r.y + 0.86;
  }
  const s = Math.min(1, b.s);
  const px = b.x;
  const pz = b.z;
  b.x = lerp(b.fx, cx, s);
  b.z = lerp(b.fz, cz, s);
  b.y = lerp(b.fy, cy, s) + b.lob * 4 * s * (1 - s);
  b.vx = (b.x - px) / DT;
  b.vz = (b.z - pz) / DT;
  const passer = m.players[b.passer];
  if (s > 0.14 && s < 0.97) {
    for (const o of m.players) {
      if (o.team === passer.team || b.checked[o.idx]) continue;
      if (o.state !== 'free' && o.state !== 'steal' && o.state !== 'jump') continue;
      const dh = hypot2(o.x - b.x, o.z - b.z);
      const active = (o.state === 'steal' && o.t >= STEAL.activeFrom - 0.02 && o.t <= STEAL.activeTo + 0.06) || o.state === 'jump';
      if (dh > (active ? PASS.reachActive : PASS.reach)) continue;
      const top = o.y + (o.state === 'jump' ? JUMP.reachUp + 0.1 : 1.45);
      if (b.y > top || b.y < o.y + 0.1) continue;
      b.checked[o.idx] = true;
      let pr: number;
      if (active) pr = 0.5 + 0.42 * o.attrs.steal;
      else if (o.idx === m.control) pr = 0.34 + 0.36 * o.attrs.steal;
      else pr = lerp(0.04, 0.26, m.cfg.difficulty) * (0.5 + o.attrs.steal);
      if (hypeOn(m, o.team)) pr += 0.1;
      if (rngNext(m) < clamp(pr, 0, 0.95)) {
        m.stats[o.idx].steals++;
        addHype(m, o.team, HYPE.steal);
        emit(m, { type: 'steal', by: o.idx, from: passer.idx, intercept: true });
        give(m, o);
        o.catchT = 0;
        return;
      }
    }
  }
  if (b.s >= 1) {
    if (canCatch(r)) {
      const hadTeam = m.possession;
      give(m, r);
      r.catchT = 0;
      r.ai.passCool = 0.9 + rngNext(m) * 0.9;
      r.ai.thinkT = Math.max(r.ai.thinkT, 0.22);
      if (hadTeam === r.team) emit(m, { type: 'catch', by: r.idx });
    } else {
      b.state = 'loose';
      b.looseT = 0;
      b.vx *= 0.35;
      b.vz *= 0.35;
      b.vy = 0.5;
    }
  }
}

function tryPickup(m: MatchState): void {
  const b = m.ball;
  let best: PlayerSim | null = null;
  let bd = 1e9;
  for (const p of m.players) {
    if (p.pickupCool > 0) continue;
    if (p.state !== 'free' && p.state !== 'jump' && p.state !== 'recover') continue;
    const dh = hypot2(p.x - b.x, p.z - b.z);
    const air = p.state === 'jump';
    if (dh > (air ? 0.85 : 0.62)) continue;
    const top = p.y + (air ? JUMP.reachUp + 0.15 : 1.5);
    if (b.y > top || b.y < p.y - 0.3) continue;
    if (dh < bd) {
      bd = dh;
      best = p;
    }
  }
  if (!best) return;
  const wasShot = b.fromShot;
  const shotTeam = b.shotTeam;
  const sameTeam = m.possession === best.team;
  give(m, best);
  best.catchT = 0;
  if (wasShot) {
    const offensive = best.team === shotTeam;
    m.stats[best.idx].rebounds++;
    if (offensive && sameTeam) m.shotClock = Math.max(m.shotClock, RULES.shotClockReset);
    addHype(m, best.team, HYPE.rebound);
    emit(m, { type: 'rebound', by: best.idx, offensive });
  } else {
    emit(m, { type: 'pickup', by: best.idx });
  }
}

function stepBallPhysics(m: MatchState): void {
  const b = m.ball;
  const py = b.y;
  const vy0 = b.vy;
  b.vy -= G_BALL * DT;
  b.x += b.vx * DT;
  b.z += b.vz * DT;
  b.y += vy0 * DT - 0.5 * G_BALL * DT * DT;
  b.bounceT += DT;
  const solid = !(b.state === 'shot' && b.ghost) && b.state !== 'dead';
  let touched = false;
  for (let hoop = -1; hoop <= 1; hoop += 2) {
    const hx = hoop * COURT.hoopX;
    if (Math.abs(b.x - hx) > 2.5) continue;
    if (solid) {
      // rim: nearest point on the ring
      const ox = b.x - hx;
      const oz = b.z;
      const dh = hypot2(ox, oz);
      if (dh > 1e-4) {
        const rx = hx + (ox / dh) * COURT.rimR;
        const rz = (oz / dh) * COURT.rimR;
        const ex = b.x - rx;
        const ey = b.y - COURT.rimY;
        const ez = b.z - rz;
        const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const minD = BALL_R + COURT.tubeR;
        if (e < minD && e > 1e-5) {
          const nx = ex / e;
          const ny = ey / e;
          const nz = ez / e;
          const vn = b.vx * nx + b.vy * ny + b.vz * nz;
          if (vn < 0) {
            const k = 1.5 * vn;
            b.vx -= k * nx;
            b.vy -= k * ny;
            b.vz -= k * nz;
            b.vx *= 0.97;
            b.vz *= 0.97;
            if (b.bounceT > 0.06) emit(m, { type: 'rim', speed: -vn, hoop });
            b.bounceT = 0;
          }
          b.x += nx * (minD - e);
          b.y += ny * (minD - e);
          b.z += nz * (minD - e);
          touched = true;
        }
      }
      // backboard face
      const bx = hoop * COURT.boardX;
      const pen = (b.x - bx) * hoop + BALL_R;
      if (pen > 0 && pen < BALL_R + 0.22 && b.y > COURT.boardY0 - BALL_R * 0.6 && b.y < COURT.boardY1 + BALL_R * 0.6 && Math.abs(b.z) < COURT.boardHalfW + BALL_R * 0.5) {
        if (b.vx * hoop > 0) {
          if (b.bounceT > 0.06) emit(m, { type: 'board', speed: Math.abs(b.vx), hoop });
          b.bounceT = 0;
          b.vx = -b.vx * 0.62;
          b.vz *= 0.9;
        }
        b.x = bx - hoop * BALL_R;
        touched = true;
      }
    }
    // through the hoop?
    if (b.state !== 'dead' && py > COURT.rimY && b.y <= COURT.rimY && b.vy < 0) {
      if (hypot2(b.x - hx, b.z) < COURT.rimR - 0.02) {
        scoreBasket(m, (hoop > 0 ? 0 : 1) as TeamId, hoop);
        return;
      }
    }
  }
  // floor
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < -1.4) {
      if (b.bounceT > 0.05) emit(m, { type: 'bounce', speed: -b.vy });
      b.bounceT = 0;
      b.vy = -b.vy * 0.64;
      b.vx *= 0.84;
      b.vz *= 0.84;
    } else {
      b.vy = 0;
      b.vx *= 1 - 1.8 * DT;
      b.vz *= 1 - 1.8 * DT;
    }
    touched = true;
  }
  // invisible walls keep it in play
  const lx = COURT.halfL + COURT.apron;
  const lz = COURT.halfW + COURT.apron;
  if (b.x > lx) {
    b.x = lx;
    b.vx = -Math.abs(b.vx) * 0.5;
  } else if (b.x < -lx) {
    b.x = -lx;
    b.vx = Math.abs(b.vx) * 0.5;
  }
  if (b.z > lz) {
    b.z = lz;
    b.vz = -Math.abs(b.vz) * 0.5;
  } else if (b.z < -lz) {
    b.z = -lz;
    b.vz = Math.abs(b.vz) * 0.5;
  }
  if (b.state === 'shot' && touched) {
    b.state = 'loose';
    b.looseT = 0;
  }
  if (b.state === 'loose') {
    b.looseT += DT;
    // a ball that dies in a corner rolls back toward the middle
    if (b.looseT > 4 && b.y <= BALL_R + 0.01) {
      b.vx -= Math.sign(b.x) * 2 * DT;
      b.vz -= Math.sign(b.z) * 2 * DT;
    }
  }
}

function stepBall(m: MatchState, live: boolean): void {
  const b = m.ball;
  switch (b.state) {
    case 'held': {
      const h = m.players[b.holder];
      const px = b.x;
      const pz = b.z;
      heldBallPos(m, h, tmp);
      b.x = tmp.x;
      b.y = tmp.y;
      b.z = tmp.z;
      b.vx = (b.x - px) / DT;
      b.vz = (b.z - pz) / DT;
      b.spin += hypot2(h.vx, h.vz) * DT * 2.2;
      return;
    }
    case 'pass':
      b.spin += 9 * DT;
      if (live) stepPass(m);
      return;
    default: {
      b.spin += (hypot2(b.vx, b.vz) + 2) * DT * 1.6;
      stepBallPhysics(m);
      if (!live) return;
      // may have just scored
      const s = m.ball.state as BallSim['state'];
      if (s === 'loose') tryPickup(m);
      else if (s === 'shot' && !b.ghost && b.vy < 0 && b.y < COURT.rimY - 0.3) {
        const hx = hoopXOf(b.shotTeam);
        if (hypot2(b.x - hx, b.z) < 1.8) tryPickup(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Control and the main step
// ---------------------------------------------------------------------------

function updateControl(m: MatchState, pad: PadInput): void {
  const ut = m.cfg.userTeam;
  if (ut === -1) {
    m.control = -1;
    return;
  }
  const b = m.ball;
  let want = m.control;
  if (want < 0 || m.players[want].team !== ut) want = nearestTo(m, ut, b.x, b.z, -1);
  if (b.state === 'held' && m.players[b.holder].team === ut) {
    want = b.holder;
  } else if (b.state === 'pass' && m.players[b.to].team === ut) {
    want = b.to;
  } else if (b.state === 'shot' && b.shooter >= 0 && m.players[b.shooter].team === ut && b.ghost) {
    // keep the shooter while a good one is in the air
  } else {
    let tx = b.x;
    let tz = b.z;
    if (b.state === 'pass') {
      tx = m.players[b.to].x;
      tz = m.players[b.to].z;
    }
    const cur = m.players[want];
    const key = `${b.state}:${b.state === 'held' ? b.holder : b.state === 'pass' ? b.to : -1}`;
    if (pad.sw && !m.padSw) {
      const n = nearestTo(m, ut, tx, tz, want);
      if (n >= 0) want = n;
    } else if (key !== m.ctrlKey && m.cfg.autoSwitch && (cur.state === 'free' || cur.state === 'recover' || cur.state === 'stumble')) {
      const n = nearestTo(m, ut, tx, tz, -1);
      if (n >= 0 && n !== want) {
        const dc = hypot2(cur.x - tx, cur.z - tz);
        const dn = hypot2(m.players[n].x - tx, m.players[n].z - tz);
        if (dc - dn > 0.9 || cur.state === 'stumble') want = n;
      }
    }
    m.ctrlKey = key;
  }
  m.control = want;
}

function padToIntent(m: MatchState, p: PlayerSim, pad: PadInput, it: Intent): void {
  resetIntent(it);
  it.mx = pad.mx;
  it.mz = pad.mz;
  it.turbo = pad.turbo;
  const aEdge = pad.a && !m.padA;
  const bEdge = pad.b && !m.padB;
  if (p.hasBall) {
    it.shootPress = aEdge;
    it.shoot = pad.a;
    it.pass = bEdge;
  } else if (m.possession !== p.team || m.ball.state === 'loose' || m.ball.state === 'shot') {
    it.jump = aEdge;
    it.steal = bEdge && m.ball.state !== 'shot';
  }
}

function stepLive(m: MatchState, pad: PadInput): void {
  updateControl(m, pad);
  for (const p of m.players) {
    if (p.idx === m.control && !m.cfg.demo) padToIntent(m, p, pad, scratchIntent);
    else aiIntent(m, p, scratchIntent);
    stepPlayer(m, p, scratchIntent, true);
    if (m.phase !== 'live') break;
  }
  m.padA = pad.a;
  m.padB = pad.b;
  m.padSw = pad.sw;
  if (m.phase !== 'live') return;
  separatePlayers(m);
  stepBall(m, true);
  if (m.phase !== 'live') return;
  // hype timers
  for (let t = 0 as TeamId; t < 2; t = (t + 1) as TeamId) {
    if (m.hypeT[t] > 0) {
      m.hypeT[t] -= DT;
      if (m.hypeT[t] <= 0) {
        m.hypeT[t] = 0;
        m.hype[t] = 0;
        emit(m, { type: 'hype', team: t, on: false });
      }
    }
    if (t === 1) break;
  }
  const b = m.ball;
  // shot clock
  if (b.state === 'held' || b.state === 'pass') {
    m.shotClock -= DT;
    if (m.shotClock <= 0) {
      const team = m.possession;
      emit(m, { type: 'shotClock', team });
      m.inboundTeam = (1 - team) as TeamId;
      m.phase = 'whistle';
      m.phaseT = 0;
      return;
    }
  }
  // game clock
  if (!m.overtime) {
    const before = m.clock;
    m.clock = Math.max(0, m.clock - DT);
    if (before > 0 && m.clock <= 10 && Math.ceil(before) !== Math.ceil(m.clock) && m.clock > 0) {
      emit(m, { type: 'tick', seconds: Math.ceil(m.clock) });
    }
    if (m.clock <= 0 && b.state !== 'shot') {
      // dunks and layups in progress do not beat the buzzer
      endPeriod(m);
    }
  }
}

/** Keep bodies and the ball moving during stoppages so nothing freezes mid-air. */
function stepIdle(m: MatchState): void {
  for (const p of m.players) {
    resetIntent(scratchIntent);
    stepPlayer(m, p, scratchIntent, false);
  }
  separatePlayers(m);
  stepBall(m, false);
}

export function stepMatch(m: MatchState, pad: PadInput): void {
  m.events.length = 0;
  m.tick++;
  m.time += DT;
  m.lastScoreT[0] += DT;
  m.lastScoreT[1] += DT;
  switch (m.phase) {
    case 'countdown': {
      const before = m.phaseT;
      m.phaseT += DT;
      const left = RULES.countdown - m.phaseT;
      const leftBefore = RULES.countdown - before;
      if (Math.ceil(left) !== Math.ceil(leftBefore) && left > 0) emit(m, { type: 'tick', seconds: Math.ceil(left) });
      stepBall(m, false);
      if (m.phaseT >= RULES.countdown) {
        m.phase = 'live';
        m.phaseT = 0;
        m.padA = pad.a;
        m.padB = pad.b;
        emit(m, { type: 'period', quarter: m.quarter, start: true, overtime: m.overtime });
      }
      return;
    }
    case 'live':
      m.phaseT += DT;
      stepLive(m, pad);
      return;
    case 'scored':
    case 'whistle': {
      m.phaseT += DT;
      stepIdle(m);
      if (m.phaseT >= (m.phase === 'scored' ? RULES.scoredPause : RULES.whistlePause)) {
        setupInbound(m, m.inboundTeam);
        m.phase = 'inbound';
        m.phaseT = 0;
        emit(m, { type: 'inbound', team: m.inboundTeam });
      }
      return;
    }
    case 'inbound': {
      m.phaseT += DT;
      stepBall(m, false);
      if (m.phaseT >= RULES.inboundPause) {
        m.phase = 'live';
        m.phaseT = 0;
        m.padA = pad.a;
        m.padB = pad.b;
      }
      return;
    }
    case 'periodEnd': {
      m.phaseT += DT;
      stepIdle(m);
      if (m.phaseT >= RULES.periodPause) startNextPeriod(m);
      return;
    }
    case 'final':
      m.phaseT += DT;
      stepIdle(m);
      return;
  }
}

export { distToHoop };
