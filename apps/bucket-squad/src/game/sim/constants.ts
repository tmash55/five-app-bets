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
/** how high the ball comes back up on a dribble (centre of the ball above its resting height) */
export const DRIBBLE_H = 0.4;
export const PLAYER_R = 0.4;

export const G_BALL = 18;
export const G_JUMP = 22;

export const MOVE = {
  speedMin: 5.5,
  speedMax: 7.3,
  turboMult: 1.3,
  /** top speed kept with the ball: a poor ball handler keeps the first, a great one the second */
  ballMultMin: 0.9,
  ballMultMax: 1.0,
  hypeMult: 1.06,
  /**
   * Speeding up, slowing down, changing direction and turning to face, from the heaviest, slowest player (agility 0)
   * to the quickest (agility 1). A player of middling agility gets about the numbers everyone used to share
   * (accel 40, decel 52, turn 15), so the spread is around the old feel, not below it.
   */
  accelMin: 32,
  accelMax: 50,
  decelMin: 44,
  decelMax: 60,
  /** how fast the run bends round when the stick points away from where the player is going */
  cutMin: 27,
  cutMax: 52,
  turnMin: 11,
  turnMax: 19,
  /** the player in the person's hands never feels less agile than this, so nobody is sluggish to the stick */
  controlAgility: 0.3,
  /** how much of a push in contact a heavy player (weight 1) shrugs off against the lightest one */
  weightPush: 0.3,
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

/** Shots from far out (see makeProb): distances in court units, chances as fractions. */
export const DEEP = {
  /** past the arc, every shooter keeps this much range... */
  grace: 0.3,
  /** ...and the best shooter this much more */
  reach: 1.5,
  /** how much the chance drops for each unit past a shooter's range, and how much more for a poor shooter */
  falloff: 0.16,
  falloffPoor: 0.08,
  /** this far past their range, the timing of the release no longer adds anything */
  timingFade: 2,
  /** further than this past their range a shot is a heave */
  heavePast: 2.5,
  /** a heave goes in at most this often, plus this much more for the best shooter */
  heaveMin: 0.01,
  heaveBest: 0.02,
} as const;

export const HYPE = {
  max: 100,
  duration: 12,
  three: 9,
  two: 4,
  dunk: 12,
  oop: 22,
  steal: 9,
  block: 10,
  perfect: 5,
  ankle: 8,
  rebound: 2,
  shotBonus: 0.12,
  /** dunk take-off range multiplier */
  dunkReach: 1.22,
} as const;

/**
 * On fire: each player's own flame meter (0..max). Plays fill it by different amounts, and more for plays in a row
 * (the streak); a full meter sets that player on fire for `duration` seconds of live play.
 */
export const FIRE = {
  max: 100,
  /** seconds of live play on fire */
  duration: 15,
  // what each play is worth before the streak
  two: 20,
  three: 27,
  dunk: 24,
  oop: 29,
  assist: 14,
  /** extra for the passer when the assist was an alley-oop */
  oopAssist: 5,
  steal: 18,
  block: 21,
  reboundOff: 12,
  reboundDef: 7,
  perfect: 8,
  /** each play in a row adds this much to the next one's worth (x1, x1.3, x1.6 ...), up to `streakMax` */
  streakStep: 0.3,
  streakMax: 2.2,
  /** a streak is over when this many seconds of live play pass without a good play */
  streakWindow: 14,
  // cooling down
  /** per second of live play */
  decay: 0.7,
  /** a missed shot (or one that is blocked) */
  miss: 6,
  /** losing the ball: stolen, picked off, or out of time on the shot clock */
  turnover: 10,
  /** the player you guard scores */
  scoredOn: 7,
  /** a computer opponent's meter fills this much as fast at the easiest level, and fully at All-Star */
  cpuMin: 0.75,
  cpuEasy: 0.2,
  cpuHard: 0.82,
  // what fire does
  shotBonus: 0.1,
  /** a hot shooter's comfortable range stretches this far (a heave from the far half stays a heave) */
  range: 0.8,
  speedMult: 1.06,
  accelMult: 1.15,
  stealBonus: 0.08,
  blockBonus: 0.08,
  dunkReach: 1.15,
  /** steal swipes come back this much sooner */
  stealCool: 0.7,
  // fire and the team's Hype together never go past these
  shotCap: 0.18,
  speedCap: 1.1,
  defenseCap: 0.16,
  reachCap: 1.3,
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
