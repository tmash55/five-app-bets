/**
 * World and tuning constants for the match simulation.
 *
 * Units are "figure units": a player stands about 1.58 tall. X runs along the
 * court (team 0 attacks +X), Y is up, Z runs across the court toward the
 * camera.
 */

export const DT = 1 / 60;

export const COURT = {
  halfL: 12,
  halfW: 6.4,
  /** hoop centre distance from mid court */
  hoopX: 10.65,
  rimY: 2.55,
  rimR: 0.31,
  tubeR: 0.028,
  /** backboard face */
  boardX: 11.06,
  boardHalfW: 0.98,
  boardY0: 2.36,
  boardY1: 3.56,
  threeR: 6.0,
  cornerZ: 5.45,
  keyHalfW: 1.65,
  /** free throw line distance from the hoop centre */
  ftDist: 3.9,
  centreR: 1.5,
  /** how far past the lines players and the ball may travel */
  apron: 0.55,
} as const;

export const BALL_R = 0.17;
export const PLAYER_R = 0.4;

export const G_BALL = 18;
export const G_JUMP = 22;

export const MOVE = {
  speedMin: 5.5,
  speedMax: 7.3,
  turboMult: 1.3,
  ballMult: 0.95,
  hypeMult: 1.06,
  accel: 40,
  decel: 52,
  turn: 15,
  turboDrain: 0.36,
  turboFill: 0.3,
  turboRelock: 0.18,
} as const;

export const SHOT = {
  crouch: 0.1,
  /** apex height of a jump shot */
  jumpH: 0.55,
  /** seconds either side of the apex that count as a perfect release */
  perfectWin: 0.05,
  goodWin: 0.115,
  lateAuto: 0.14,
  setPointUp: 1.5,
  setPointFwd: 0.36,
} as const;

export const DUNK = {
  /** minimum dunk rating to dunk at all */
  minAttr: 0.3,
  rangeMin: 2.2,
  rangeMax: 4.4,
  endBack: 0.42,
  handUp: 1.62,
  bump: 0.36,
  hang: 0.3,
} as const;

export const LAYUP = {
  range: 3.0,
  dur: 0.5,
  endBack: 1.0,
  apex: 0.82,
  releaseU: 0.52,
} as const;

export const PASS = {
  windup: 0.07,
  dur: 0.2,
  speed: 17,
  speedBonus: 5,
  reach: 0.62,
  reachActive: 0.98,
} as const;

export const STEAL = {
  dur: 0.32,
  activeFrom: 0.06,
  activeTo: 0.2,
  reach: 1.2,
  lunge: 2.2,
  cooldown: 0.5,
  immunity: 0.45,
} as const;

export const JUMP = {
  apexMin: 0.72,
  apexMax: 1.22,
  reachUp: 2.02,
  land: 0.1,
} as const;

export const HYPE = {
  max: 100,
  duration: 12,
  three: 14,
  two: 6,
  dunk: 16,
  oop: 30,
  steal: 12,
  block: 14,
  perfect: 8,
  ankle: 12,
  rebound: 3,
  shotBonus: 0.12,
} as const;

export const RULES = {
  shotClock: 18,
  shotClockReset: 10,
  scoredPause: 1.55,
  inboundPause: 0.85,
  countdown: 3.0,
  periodPause: 2.8,
  whistlePause: 1.3,
} as const;
