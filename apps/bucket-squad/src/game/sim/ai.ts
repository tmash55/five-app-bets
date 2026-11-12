/**
 * Computer players. Each one produces the same kind of intent the person's
 * gamepad does, so the simulation treats everybody alike.
 *
 * `skill` (0..1) scales reaction time, shot selection and how often they go
 * for steals and blocks. It never changes what a player can physically do.
 */

import { COURT, DT, LAYUP, RULES } from './constants';
import {
  attackSign,
  canDunk,
  dunkRange,
  hoopXOf,
  isThree,
  laneClear,
  makeProb,
  nearestOpponentDist,
  resetIntent,
  shotContest,
} from './core';
import { clamp, clamp01, hypot2, lerp, rngBell, rngNext } from './math';
import type { AiMemory, Intent, MatchState, PlayerSim, TeamId } from './types';

/** Places to stand on offense: [distance out from the hoop along the court, across]. */
const SPOTS: readonly (readonly [number, number])[] = [
  [6.7, 0],
  [4.7, -4.5],
  [4.7, 4.5],
  [0.5, -5.85],
  [0.5, 5.85],
  [3.5, -1.9],
  [3.5, 1.9],
  [1.0, -2.1],
  [1.0, 2.1],
];
const PERIMETER = [true, true, true, true, true, false, false, false, false];

export function newAiMemory(): AiMemory {
  return {
    thinkT: 0,
    tx: 0,
    tz: 0,
    spot: -1,
    relocT: 0,
    cutT: 0,
    plan: 'none',
    planT: 0,
    releaseAt: 0,
    stealT: 1,
    jumpAt: -1,
    jumpFor: 0,
    passCool: 0,
    sprint: false,
  };
}

/** Called whenever the ball changes sides or play restarts. */
export function aiReset(p: PlayerSim): void {
  const ai = p.ai;
  ai.spot = -1;
  ai.relocT = 0;
  ai.cutT = 0;
  ai.plan = 'none';
  ai.planT = 0;
  ai.thinkT = 0.12 + (p.slot % 3) * 0.05;
  ai.jumpAt = -1;
  ai.jumpFor = 0;
  ai.passCool = 0.3;
  ai.stealT = Math.max(ai.stealT, 0.6);
}

function skillOf(m: MatchState, p: PlayerSim): number {
  return m.cfg.userTeam >= 0 && p.team === m.cfg.userTeam ? m.cfg.mateSkill : m.cfg.difficulty;
}

function moveTo(p: PlayerSim, it: Intent, tx: number, tz: number, slowR: number, turbo: boolean): number {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = hypot2(dx, dz);
  if (d < 0.12) return d;
  const k = d < slowR ? Math.max(0.25, d / slowR) : 1;
  it.mx = (dx / d) * k;
  it.mz = (dz / d) * k;
  it.turbo = turbo && d > 1.5;
  return d;
}

function spotX(team: TeamId, i: number): number {
  return hoopXOf(team) - attackSign(team) * SPOTS[i][0];
}

function chooseSpot(m: MatchState, p: PlayerSim): void {
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < SPOTS.length; i++) {
    const sx = spotX(p.team, i);
    const sz = SPOTS[i][1];
    let w = PERIMETER[i] ? 0.5 + p.attrs.shot : 0.3 + 0.8 * p.attrs.dunk;
    for (const q of m.players) {
      if (q.team !== p.team || q === p) continue;
      if (q.hasBall) {
        if (hypot2(q.x - sx, q.z - sz) < 2.5) w = 0;
      } else if (q.ai.spot === i) {
        w = 0;
      } else if (q.ai.spot >= 0) {
        const qx = spotX(p.team, q.ai.spot);
        const qz = SPOTS[q.ai.spot][1];
        if (hypot2(qx - sx, qz - sz) < 2.4) w *= 0.25;
      }
    }
    if (i === p.ai.spot) w *= 0.35;
    weights.push(w);
    total += w;
  }
  if (total <= 0) {
    p.ai.spot = 0;
    return;
  }
  let r = rngNext(m) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      p.ai.spot = i;
      return;
    }
  }
  p.ai.spot = weights.length - 1;
}

/** A pass lane is open when no defender (other than ones hugging the passer) sits on it. */
function passLaneOpen(m: MatchState, from: PlayerSim, to: PlayerSim): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 0.5) return false;
  for (const o of m.players) {
    if (o.team === from.team || o.state === 'stumble') continue;
    const t = ((o.x - from.x) * dx + (o.z - from.z) * dz) / l2;
    if (t < 0.12 || t > 1.02) continue;
    const cx = from.x + dx * t;
    const cz = from.z + dz * t;
    if (hypot2(o.x - cx, o.z - cz) < 0.8) return false;
  }
  return true;
}

function handlerAi(m: MatchState, p: PlayerSim, it: Intent, skill: number): void {
  const ai = p.ai;
  const s = attackSign(p.team);
  const hx = hoopXOf(p.team);
  const dxh = hx - p.x;
  const d = hypot2(dxh, p.z);
  const front = dxh * s;
  const elapsed = RULES.shotClock - m.shotClock;
  const urgency = clamp01(elapsed / RULES.shotClock);
  const clockLow = m.shotClock < 2 || (!m.overtime && m.clock < 1.5);
  const finishR = canDunk(p) ? dunkRange(m, p) * 0.92 : LAYUP.range * 0.9;
  // how long this player likes to work before settling for a jump shot
  if (ai.planT <= 0) ai.planT = 1.8 + rngNext(m) * 2.6;
  if (ai.thinkT <= 0) {
    ai.thinkT = lerp(0.42, 0.16, skill) + rngNext(m) * 0.12;
    const laneOpen = front > 0.5 && laneClear(m, p.team, p.x, p.z, hx - s * 0.6, 0, 0.8);
    const contest = shotContest(m, p);
    const three = isThree(p.x, p.z, p.team);
    // they like threes and shots at the rim more than long twos
    const ev = makeProb(m, p, contest, 'good', 0) * (three ? 3 : d < 2.6 ? 2 : 1.65);
    let th = lerp(1.3, 0.8, urgency) - 0.1 * (skill - 0.5);
    if (elapsed < ai.planT) th += 0.3;
    if (p.x * s < -1 || d > COURT.threeR + 1.5) th = 9;
    let bestMate = -1;
    let bestVal = 0;
    if (ai.passCool <= 0) {
      for (const q of m.players) {
        if (q.team !== p.team || q === p || q.state !== 'free') continue;
        if (!passLaneOpen(m, p, q)) continue;
        const open = nearestOpponentDist(m, q.x, q.z, p.team);
        const qd = hypot2(hx - q.x, q.z);
        let val = clamp01(open / 1.7);
        if (qd < 2.6) val *= 1.75;
        else if (isThree(q.x, q.z, q.team)) val *= 0.85 + 0.8 * q.attrs.shot;
        else val *= 0.75 + 0.5 * q.attrs.shot;
        if ((q.x - p.x) * s > 1) val += 0.15;
        if (q.ai.cutT > 0 && open > 1.1) val += 0.5;
        if (val > bestVal) {
          bestVal = val;
          bestMate = q.idx;
        }
      }
    }
    const driveVal = laneOpen ? 1.5 - d * 0.035 : 0;
    if (d < finishR && front > 0.4 && (laneOpen || d < 2.4 || urgency > 0.5)) {
      ai.plan = 'finish';
    } else if (clockLow) {
      ai.plan = d < finishR + 0.6 && front > 0.4 ? 'finish' : 'shoot';
    } else if (laneOpen && d < 9 && driveVal > ev * (0.85 + rngNext(m) * 0.3)) {
      ai.plan = 'drive';
    } else if (ev >= th && contest < 0.6) {
      ai.plan = 'shoot';
    } else if (bestMate >= 0 && bestVal > ev * 0.55 + 0.5 && rngNext(m) < lerp(0.35, 0.7, skill)) {
      it.pass = true;
      it.passTo = bestMate;
      ai.passCool = 1.2;
      ai.plan = 'none';
      return;
    } else if (p.x * s < -0.5) {
      ai.plan = 'none';
    } else if (d < 8.5 && front > 1 && rngNext(m) < 0.22 + 0.25 * urgency) {
      // attack the defender anyway
      ai.plan = 'drive';
    } else {
      // slide along the arc to shake the defender
      ai.plan = 'probe';
      const ang = Math.atan2(p.z, Math.max(0.1, front));
      const na = clamp(ang + (rngNext(m) < 0.5 ? -1 : 1) * (0.5 + rngNext(m) * 0.5), -1.35, 1.35);
      const r = 4.4 + rngNext(m) * 2.4;
      ai.tx = hx - s * Math.cos(na) * r;
      ai.tz = Math.sin(na) * r;
    }
  }
  switch (ai.plan) {
    case 'finish': {
      moveTo(p, it, hx - s * 0.5, 0, 0.1, true);
      it.turbo = true;
      const sp = hypot2(p.vx, p.vz);
      const toward = sp > 0.5 && d > 0.01 ? (p.vx * dxh + p.vz * -p.z) / (sp * d) : 0;
      if ((toward > 0.5 && sp > 2.5) || d < 1.5 || clockLow) it.shootPress = true;
      return;
    }
    case 'shoot': {
      // how well they time the release depends on skill, not luck alone
      const r = rngNext(m);
      const pPerfect = lerp(0.06, 0.36, skill);
      const pGood = lerp(0.4, 0.46, skill);
      if (r < pPerfect) ai.releaseAt = (rngNext(m) - 0.5) * 0.08;
      else if (r < pPerfect + pGood) ai.releaseAt = (rngNext(m) < 0.5 ? -1 : 1) * (0.06 + rngNext(m) * 0.05);
      else ai.releaseAt = -(0.13 + rngNext(m) * 0.09);
      it.shootPress = true;
      it.shoot = true;
      ai.plan = 'none';
      return;
    }
    case 'drive': {
      moveTo(p, it, hx - s * 0.7, p.z * 0.25, 0.1, p.turbo > 0.25);
      if (d < finishR && front > 0.4) it.shootPress = true;
      return;
    }
    case 'probe': {
      moveTo(p, it, ai.tx, ai.tz, 0.4, false);
      return;
    }
    default: {
      // bring it up the floor: run on a break, otherwise walk it up
      const brk = laneClear(m, p.team, p.x, p.z, hx - s * 0.6, 0, 2.2);
      moveTo(p, it, hx - s * 6.8, p.z * 0.5, 0.3, brk && p.turbo > 0.3);
      if (!brk) {
        it.mx *= 0.8;
        it.mz *= 0.8;
      } else if (d < finishR + 2) {
        ai.plan = 'drive';
      }
    }
  }
}

function offBallAi(m: MatchState, p: PlayerSim, it: Intent): void {
  const ai = p.ai;
  const s = attackSign(p.team);
  const hx = hoopXOf(p.team);
  const b = m.ball;
  if (b.state === 'pass' && b.to === p.idx) return; // wait for it
  const handler = b.state === 'held' ? m.players[b.holder] : m.players[b.to];
  if (ai.spot < 0 || ai.relocT <= 0) {
    chooseSpot(m, p);
    ai.relocT = 2 + rngNext(m) * 2.4;
    if (handler && handler.x * s > -2 && rngNext(m) < 0.28 + 0.25 * p.attrs.dunk) ai.cutT = 1.25;
  }
  let tx: number;
  let tz: number;
  if (ai.cutT > 0) {
    tx = hx - s * 1.15;
    tz = clamp(p.z, -1, 1) * 0.6;
  } else {
    tx = spotX(p.team, ai.spot);
    tz = SPOTS[ai.spot][1];
  }
  const far = hypot2(tx - p.x, tz - p.z);
  moveTo(p, it, tx, tz, 0.5, (far > 3.2 || ai.cutT > 0) && p.turbo > 0.2);
}

function defenseAi(m: MatchState, p: PlayerSim, it: Intent, skill: number): void {
  const ai = p.ai;
  const b = m.ball;
  const oppTeam = (1 - p.team) as TeamId;
  const hx = hoopXOf(oppTeam);
  let man = m.players[p.mark];
  if (!man || man.team === p.team) man = m.players.find((q) => q.team !== p.team) as PlayerSim;
  const handler = b.state === 'held' ? m.players[b.holder] : b.state === 'pass' ? m.players[b.to] : null;
  const onBall = handler === man;

  // --- reactions: go up with shooters and dunkers
  for (const q of m.players) {
    if (q.team === p.team || q.released) continue;
    if (q.state === 'shoot') {
      if (ai.jumpFor !== q.idx + 1 && hypot2(q.x - p.x, q.z - p.z) < 1.7) {
        ai.jumpFor = q.idx + 1;
        if (rngNext(m) < lerp(0.4, 0.9, skill)) {
          ai.jumpAt = Math.max(m.time, m.time - q.t + lerp(0.3, 0.1, skill) + rngNext(m) * 0.08);
        } else {
          ai.jumpAt = -1;
        }
      }
    } else if (q.state === 'dunk' || q.state === 'oop' || q.state === 'layup') {
      if (ai.jumpFor !== q.idx + 1 && hypot2(p.x - hx, p.z) < 1.9) {
        ai.jumpFor = q.idx + 1;
        if (rngNext(m) < lerp(0.25, 0.75, skill)) {
          const arrive = q.dur * (q.state === 'layup' ? LAYUP.releaseU : 1);
          ai.jumpAt = Math.max(m.time, m.time - q.t + arrive - 0.32);
        } else {
          ai.jumpAt = -1;
        }
      }
    }
  }
  if (ai.jumpFor > 0) {
    const q = m.players[ai.jumpFor - 1];
    if (q.state !== 'shoot' && q.state !== 'dunk' && q.state !== 'oop' && q.state !== 'layup') ai.jumpFor = 0;
  }
  if (ai.jumpAt > 0 && m.time >= ai.jumpAt) {
    ai.jumpAt = -1;
    it.jump = true;
    return;
  }

  // --- positioning: stay between the man and the hoop
  const mdx = hx - man.x;
  const mdz = -man.z;
  const md = hypot2(mdx, mdz) || 1;
  let gap = onBall ? lerp(1.5, 1.05, skill) : 2.3;
  if (md > 9) gap = Math.max(gap, md - 8.2);
  if (gap > md - 0.6) gap = Math.max(0.5, md - 0.6);
  let tx = man.x + (mdx / md) * gap;
  let tz = man.z + (mdz / md) * gap;
  if (!onBall && handler) {
    tx = lerp(tx, handler.x, 0.2);
    tz = lerp(tz, handler.z, 0.2);
    // the weak-side defender drops into the paint once the ball is in scoring range
    if (hypot2(hx - handler.x, handler.z) < 7.5) {
      let weak = true;
      const mine = hypot2(man.x - handler.x, man.z - handler.z);
      for (const q of m.players) {
        if (q.team !== p.team || q === p) continue;
        const qm = m.players[q.mark];
        if (!qm || qm === handler) continue;
        if (hypot2(qm.x - handler.x, qm.z - handler.z) > mine) weak = false;
      }
      if (weak) {
        tx = lerp(tx, hx - attackSign(oppTeam) * 1.7, 0.55);
        tz = lerp(tz, 0, 0.55);
      }
    }
    // step in when the dribbler has beaten their defender
    const hd = hypot2(hx - handler.x, handler.z);
    if (hd < 4.6 && handler.state === 'free') {
      const hDef = m.players[handler.mark];
      const defD = hDef && hDef.team === p.team && hDef.state !== 'stumble' ? hypot2(hx - hDef.x, hDef.z) : 99;
      if (defD > hd - 0.2 && hypot2(p.x - hx, p.z) < 5.5) {
        tx = lerp(handler.x, hx, 0.55);
        tz = lerp(handler.z, 0, 0.55);
      }
    }
  }
  const dist = hypot2(tx - p.x, tz - p.z);
  const beaten = hypot2(hx - p.x, p.z) > md + 0.3;
  moveTo(p, it, tx, tz, 0.45, (dist > 2.2 || beaten) && p.turbo > 0.15);

  // --- reach for the ball now and then
  if (onBall && handler && handler.state === 'free' && ai.stealT <= 0) {
    if (hypot2(handler.x - p.x, handler.z - p.z) < 1.15) {
      ai.stealT = lerp(3.4, 1.4, skill) + rngNext(m) * 1.6;
      if (rngNext(m) < lerp(0.35, 0.85, skill)) it.steal = true;
    }
  }
}

function reboundAi(m: MatchState, p: PlayerSim, it: Intent): void {
  const b = m.ball;
  const hx = hoopXOf(b.shotTeam);
  const s = attackSign(b.shotTeam);
  const defending = p.team !== b.shotTeam;
  const myD = hypot2(p.x - hx, p.z);
  let rank = 0;
  for (const q of m.players) {
    if (q.team === p.team && q !== p && hypot2(q.x - hx, q.z) < myD) rank++;
  }
  const crash = defending ? rank <= 1 : rank === 0;
  if (crash) {
    const sh = m.players[b.shooter];
    const side = sh && sh.z < 0 ? -1 : 1;
    const tx = hx - s * (1.25 + 0.55 * rank);
    const tz = (rank === 0 ? 0.35 : -0.9) * side * (defending ? 1 : -1);
    moveTo(p, it, tx, tz, 0.4, p.turbo > 0.2);
  } else if (defending) {
    const man = m.players[p.mark];
    moveTo(p, it, lerp(man.x, hx, 0.3), man.z * 0.7, 0.5, false);
  } else {
    moveTo(p, it, hx - s * 7.5, p.z * 0.6, 0.6, false);
  }
}

function looseAi(m: MatchState, p: PlayerSim, it: Intent, skill: number): void {
  const b = m.ball;
  const dB = hypot2(p.x - b.x, p.z - b.z);
  let rank = 0;
  for (const q of m.players) {
    if (q.team !== p.team || q === p || q.state === 'stumble') continue;
    if (hypot2(q.x - b.x, q.z - b.z) < dB) rank++;
  }
  if (rank <= 1) {
    const lead = clamp(dB / 8, 0, 0.45);
    moveTo(p, it, b.x + b.vx * lead, b.z + b.vz * lead, 0.1, p.turbo > 0.1);
    if (dB < 0.95 && b.y > 1.75 && b.y < 3.5 && b.vy < 1.5 && rngNext(m) < lerp(0.05, 0.22, skill)) it.jump = true;
    return;
  }
  // the third player hangs back as a safety
  const own = -hoopXOf(p.team);
  moveTo(p, it, lerp(b.x, own, 0.45), b.z * 0.5, 0.6, false);
}

export function aiIntent(m: MatchState, p: PlayerSim, it: Intent): void {
  resetIntent(it);
  const ai = p.ai;
  const b = m.ball;
  ai.thinkT -= DT;
  ai.relocT -= DT;
  ai.stealT -= DT;
  ai.passCool -= DT;
  if (ai.cutT > 0) ai.cutT -= DT;
  if (p.state === 'shoot') {
    it.shoot = p.t < ai.releaseAt;
    return;
  }
  if (p.state === 'jump') {
    // drift toward the ball for boards
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = hypot2(dx, dz);
    if (d > 0.1 && d < 2.5) {
      it.mx = dx / d;
      it.mz = dz / d;
    }
    return;
  }
  if (p.state !== 'free' && p.state !== 'recover' && p.state !== 'pass') return;
  const skill = skillOf(m, p);
  if (b.state === 'shot') {
    reboundAi(m, p, it);
    return;
  }
  if (b.state === 'loose') {
    looseAi(m, p, it, skill);
    return;
  }
  if (b.state === 'dead') return;
  if (p.hasBall) {
    if (p.state === 'free') handlerAi(m, p, it, skill);
  } else if (m.possession === p.team) {
    offBallAi(m, p, it);
  } else {
    defenseAi(m, p, it, skill);
  }
}
