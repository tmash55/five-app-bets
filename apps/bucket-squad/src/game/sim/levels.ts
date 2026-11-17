/**
 * How the computer plays against a person, level by level: the one table to tune.
 *
 * Each row is for one computer skill (`MatchConfig.difficulty`); a skill between two rows plays between them, so the
 * tour and the ladder, whose skills climb in small steps, get a little harder at every step. The quick game's
 * Rookie, Pro and All-Star sit at 0.22, 0.5 and 0.82 (see meta/setups `QUICK_LEVELS`).
 *
 * The table is only for a computer team playing against a person. A person's own computer teammates, both sides of a
 * two-player game (one screen or two devices) and a game with nobody playing keep the computer's original play,
 * worked out from their skill alone (`steadyLevel`), so those games come out exactly as they always did.
 */

import { lerp } from './math';
import { isHuman } from './seats';
import type { MatchState, TeamId } from './types';

export interface CpuLevel {
  /** the computer skill this row is for */
  at: number;

  // --- with the ball
  /** seconds between the ball handler's looks at what to do (slower: it stands and dribbles more) */
  think: number;
  /** how keen it is to take the ball to the rim, 1 as keen as ever (less: it settles for jumpers and passes) */
  drive: number;
  /** chance it sprints when it drives or goes up to finish */
  burst: number;
  /** chance a look ends in a jump shot it should not take, from wherever it is */
  badShot: number;
  /** chance it passes to a teammate it sees open */
  pass: number;
  /** chance a pass goes without a look at the lane, where a defender can pick it off */
  sloppy: number;
  /** of its timed jump shots, the share released perfectly, and the share released well */
  perfect: number;
  good: number;
  /** its chance on every jump shot and layup, as a share of the usual (1: no change) */
  make: number;
  /** how far out it takes off for a dunk, as a share of the usual (less: more layups, which miss more) */
  dunkReach: number;
  /** added to the person's chance of stealing the ball from it (a loose dribble) */
  looseHandle: number;
  /** how often its sharp cuts trip up the person, as a share of the usual */
  juke: number;
  /** how hard it goes after rebounds and loose balls: 1 flat out, less at a jog (the stick only part way, no sprint) */
  hustle: number;

  // --- on defense
  /** seconds between its looks at where to stand (0: every moment; more: a step behind the play) */
  react: number;
  /** how far off the ball handler it plays */
  gap: number;
  /** 0..1 help: the weak-side defender dropping into the paint, a teammate stepping up on a drive */
  help: number;
  /** chance of going up at a jump shot near it, and how late it goes (seconds after the shot starts) */
  contest: number;
  contestLate: number;
  /** chance of going up at a layup or a dunk at its rim */
  rimJump: number;
  /** chance of reaching in when the ball handler is close, and seconds between tries */
  reach: number;
  reachEvery: number;
  /** added to the chance of its swipes and its blocks working */
  stealHit: number;
  blockHit: number;
  /** chance of picking off a pass it is near (times 0.5 + its steal rating) */
  intercept: number;
  /** added to the person's chance of blocking its shots */
  giveBlock: number;
}

/**
 * The computer against a person. Between rows, every number is in between. What each row comes to was measured with
 * whole games against made-up people (testing/playerModel.ts, testing/difficultyLab.ts); the tests in
 * meta/__tests__/difficulty.test.ts, ladderClimb.test.ts and tourClimb.test.ts hold the levels to it, so run them
 * after a change here.
 *
 * - Easiest (0): where Rookie can ease down to for a child who keeps losing (meta/form), and the first tour stop's
 *   Warm-Up is close by.
 * - Rookie (0.22): a young beginner who chases the ball and mashes the buttons wins about 8 games in 10, mostly close.
 *   It walks the ball up, drives seldom and lays the ball up rather than dunking, takes bad shots and misses more,
 *   jogs after rebounds; on defense it is a step behind, hardly helps, rarely reaches or goes up, and loses the ball
 *   to a swipe easily.
 * - Pro (0.5): an adult new to the game wins about half the time; a beginner about 1 in 7.
 * - All-Star (0.82): a good player wins about half the time; an adult new to the game 1 in 4, a beginner hardly ever.
 *   It drives and dunks less than the computer used to, which nobody could stop.
 * - Legend (1): past the top of the ladder (Legend is 0.9): a good player still wins about 1 in 4.
 */
export const CPU_LEVELS: readonly CpuLevel[] = [
  // Easiest
  { at: 0, think: 0.6, drive: 0.25, burst: 0.1, badShot: 0.25, pass: 0.3, sloppy: 0.45, perfect: 0.03, good: 0.3, make: 0.65, dunkReach: 0.3, looseHandle: 0.25, juke: 0.2, hustle: 0.5, react: 0.5, gap: 1.8, help: 0, contest: 0.15, contestLate: 0.42, rimJump: 0.1, reach: 0.15, reachEvery: 4.5, stealHit: -0.08, blockHit: -0.2, intercept: 0.02, giveBlock: 0.25 },
  // Rookie
  { at: 0.22, think: 0.56, drive: 0.35, burst: 0.25, badShot: 0.18, pass: 0.38, sloppy: 0.36, perfect: 0.08, good: 0.36, make: 0.7, dunkReach: 0.5, looseHandle: 0.22, juke: 0.35, hustle: 0.55, react: 0.38, gap: 1.6, help: 0.2, contest: 0.3, contestLate: 0.36, rimJump: 0.2, reach: 0.25, reachEvery: 3.8, stealHit: -0.06, blockHit: -0.15, intercept: 0.04, giveBlock: 0.18 },
  // Pro
  { at: 0.5, think: 0.36, drive: 0.5, burst: 0.6, badShot: 0.08, pass: 0.53, sloppy: 0.12, perfect: 0.18, good: 0.43, make: 0.86, dunkReach: 0.5, looseHandle: 0.08, juke: 0.7, hustle: 0.72, react: 0.26, gap: 1.35, help: 0.45, contest: 0.55, contestLate: 0.24, rimJump: 0.42, reach: 0.45, reachEvery: 2.6, stealHit: -0.06, blockHit: -0.05, intercept: 0.11, giveBlock: 0.08 },
  // All-Star
  { at: 0.82, think: 0.24, drive: 0.58, burst: 0.9, badShot: 0.02, pass: 0.64, sloppy: 0.03, perfect: 0.28, good: 0.45, make: 0.87, dunkReach: 0.5, looseHandle: 0, juke: 1, hustle: 0.8, react: 0.16, gap: 1.15, help: 0.7, contest: 0.78, contestLate: 0.15, rimJump: 0.62, reach: 0.45, reachEvery: 1.9, stealHit: -0.06, blockHit: -0.05, intercept: 0.14, giveBlock: 0 },
  // Legend
  { at: 1, think: 0.18, drive: 0.75, burst: 1, badShot: 0, pass: 0.7, sloppy: 0, perfect: 0.36, good: 0.46, make: 0.94, dunkReach: 0.7, looseHandle: 0, juke: 1, hustle: 0.95, react: 0.08, gap: 1.05, help: 0.9, contest: 0.9, contestLate: 0.1, rimJump: 0.75, reach: 0.65, reachEvery: 1.4, stealHit: -0.02, blockHit: 0, intercept: 0.2, giveBlock: 0 },
];

const KEYS = Object.keys(CPU_LEVELS[0]) as (keyof CpuLevel)[];

/** The row for a computer skill, in between the table's rows. */
export function cpuLevel(skill: number): CpuLevel {
  const rows = CPU_LEVELS;
  if (skill <= rows[0].at) return rows[0];
  for (let i = 1; i < rows.length; i++) {
    const hi = rows[i];
    if (skill > hi.at) continue;
    const lo = rows[i - 1];
    const t = (skill - lo.at) / (hi.at - lo.at);
    const out = {} as CpuLevel;
    for (const k of KEYS) out[k] = lerp(lo[k], hi[k], t);
    out.at = skill;
    return out;
  }
  return rows[rows.length - 1];
}

/**
 * The computer's original play at a skill, before the table: what a person's own teammates, both sides of a
 * two-player game and a game with nobody playing still get. The new things the table can do are all off here.
 */
export function steadyLevel(skill: number): CpuLevel {
  return {
    at: skill,
    think: lerp(0.42, 0.16, skill),
    drive: 1,
    burst: 1,
    badShot: 0,
    pass: lerp(0.35, 0.7, skill),
    sloppy: 0,
    perfect: lerp(0.06, 0.36, skill),
    good: lerp(0.4, 0.46, skill),
    make: 1,
    dunkReach: 1,
    looseHandle: 0,
    juke: 1,
    hustle: 1,
    react: 0,
    gap: lerp(1.5, 1.05, skill),
    help: 1,
    contest: lerp(0.4, 0.9, skill),
    contestLate: lerp(0.3, 0.1, skill),
    rimJump: lerp(0.25, 0.75, skill),
    reach: lerp(0.35, 0.85, skill),
    reachEvery: lerp(3.4, 1.4, skill),
    stealHit: 0,
    blockHit: 0,
    intercept: lerp(0.04, 0.26, skill),
    giveBlock: 0,
  };
}

/** A computer team whose opponent is a person: it plays by the table. */
export function facesPerson(m: MatchState, team: TeamId): boolean {
  return !isHuman(m, team) && isHuman(m, (1 - team) as TeamId);
}

const tableCache = new Map<number, CpuLevel>();
const steadyCache = new Map<number, CpuLevel>();

function cached(cache: Map<number, CpuLevel>, skill: number, make: (s: number) => CpuLevel): CpuLevel {
  let row = cache.get(skill);
  if (!row) {
    row = make(skill);
    if (cache.size > 64) cache.clear();
    cache.set(skill, row);
  }
  return row;
}

/** How a player on `team` plays at `skill`: by the table against a person, the original way otherwise. */
export function levelOf(m: MatchState, team: TeamId, skill: number): CpuLevel {
  return facesPerson(m, team) ? cached(tableCache, skill, cpuLevel) : cached(steadyCache, skill, steadyLevel);
}

/** The table's row for the computer team `team` when it plays a person, or null when it does not. */
export function opponentLevel(m: MatchState, team: TeamId): CpuLevel | null {
  return facesPerson(m, team) ? cached(tableCache, m.cfg.difficulty, cpuLevel) : null;
}
