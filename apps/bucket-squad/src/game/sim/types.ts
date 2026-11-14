export type TeamId = 0 | 1;

/** Normalised abilities, each 0..1 (see ratings.ts for the 1-99 card numbers). */
export interface Attrs {
  speed: number;
  shot: number;
  dunk: number;
  handle: number;
  steal: number;
  block: number;
}

export interface PlayerSetup {
  /** roster id, used by the renderer to pick the look */
  id: string;
  attrs: Attrs;
  /** 0..1 how heavy this player is (bigger players are slower to start and turn, and harder to push off a spot); worked out from the ratings when left out */
  weight?: number;
}

/** How a player moves, worked out once from the ratings (see feel.ts). */
export interface Handling {
  /** 0..1 quick feet: speed and handles, less weight */
  agility: number;
  /** 0..1 heavy and strong */
  weight: number;
  accel: number;
  decel: number;
  /** how fast the run bends round into a new direction */
  cut: number;
  /** how fast the body turns to face (radians a second) */
  turn: number;
  /** share of top speed kept with the ball */
  ballMult: number;
}

export interface TeamSetup {
  players: PlayerSetup[];
}

export interface MatchConfig {
  seed: number;
  teams: [TeamSetup, TeamSetup];
  /** which team the person controls, -1 for a computer-only match (in a two-player game: the first player's team) */
  userTeam: -1 | TeamId;
  /**
   * Which teams people play, home first. Left out, only `userTeam` is played by a person. A second human team gets
   * its own controlled player and pad (see `MatchState.second`); its other players stay computer controlled.
   */
  humans?: [boolean, boolean];
  quarters: number;
  quarterSeconds: number;
  /** 0..1 skill of the computer opponents */
  difficulty: number;
  /** 0..1 skill of computer-controlled players on the person's own team */
  mateSkill: number;
  /** widens the perfect-release window for the person (1 = standard) */
  timingAssist: number;
  /** per team, in place of `timingAssist`, for a team a person plays (two-player games) */
  teamAssist?: [number, number];
  /** keep matches close: 0 none, 1 strong */
  rubberBand: number;
  /**
   * per team, in place of `rubberBand`: how much help that team gets while it is behind (a handicap). The side ahead
   * is held back only by the other side's number, so [0, 0] is no rubber band at all and [r, r] is `rubberBand: r`.
   */
  catchUp?: [number, number];
  autoSwitch: boolean;
  /** the person's team plays itself while the camera, rings and HUD behave as if someone were playing (trailers and screenshots) */
  demo?: boolean;
}

export interface PadInput {
  mx: number;
  mz: number;
  turbo: boolean;
  /** shoot on offense, jump on defense */
  a: boolean;
  /** pass on offense, steal on defense */
  b: boolean;
  /** switch defender */
  sw: boolean;
}

/**
 * One team's controls for one tick: the stick (each axis -1..1, screen right and down) and the buttons held. Plain
 * data with nothing else in it, so a network layer can send it as it is (see `input.ts` for a compact form).
 */
export type InputFrame = PadInput;

/** What one tick of the match reads: a frame for each team, home first; null for a team nobody plays. */
export type TeamFrames = readonly [InputFrame | null, InputFrame | null];

/** A person's seat at the match: their controlled player and what their buttons did last tick. */
export interface Seat {
  /** index of the player this person controls, -1 when none */
  control: number;
  /** pad buttons last tick, for edge detection */
  padA: boolean;
  padB: boolean;
  padSw: boolean;
  /** changes whenever the ball changes hands or state, drives defender auto switch */
  ctrlKey: string;
}

export type PState =
  | 'free'
  | 'shoot'
  | 'layup'
  | 'dunk'
  | 'oop'
  | 'hang'
  | 'pass'
  | 'steal'
  | 'jump'
  | 'stumble'
  | 'recover'
  | 'celebrate';

export type DunkStyle = 'tomahawk' | 'twoHand' | 'windmill' | 'spin';

export interface Intent {
  mx: number;
  mz: number;
  turbo: boolean;
  /** edge: begin a shot, dunk or layup */
  shootPress: boolean;
  /** held: letting go releases the jump shot */
  shoot: boolean;
  /** edge: pass now */
  pass: boolean;
  /** explicit receiver (player index), -1 to choose by stick direction */
  passTo: number;
  /** edge */
  jump: boolean;
  /** edge */
  steal: boolean;
}

export interface AiMemory {
  thinkT: number;
  /** current destination */
  tx: number;
  tz: number;
  spot: number;
  relocT: number;
  cutT: number;
  /** wants to shoot / drive */
  plan: 'none' | 'shoot' | 'finish' | 'drive' | 'probe';
  planT: number;
  releaseAt: number;
  stealT: number;
  /** reaction timers */
  jumpAt: number;
  jumpFor: number;
  passCool: number;
  sprint: boolean;
}

export interface PlayerSim {
  idx: number;
  team: TeamId;
  slot: number;
  id: string;
  attrs: Attrs;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** height of the feet above the floor */
  y: number;
  vy: number;
  /** direction the player faces: (cos, sin) in (x, z) */
  facing: number;
  state: PState;
  /** seconds in the current state */
  t: number;
  dur: number;
  hasBall: boolean;
  /** 0..1 sprint energy */
  turbo: number;
  turboLock: number;
  sprinting: boolean;
  /** dribble cycle, in bounces */
  dribT: number;
  /** +1 ball in the right hand, -1 in the left (blends through 0 on a crossover) */
  hand: number;
  handTarget: number;
  /** player index this one is guarding */
  mark: number;
  // --- scripted move data (shoot / dunk / layup / pass) ---
  sx: number;
  sz: number;
  ex: number;
  ez: number;
  ey: number;
  style: DunkStyle;
  released: boolean;
  passTo: number;
  /** shot release timing error in seconds (negative = early), for the meter */
  relErr: number;
  /** remaining seconds where the ball cannot be stolen from this player */
  safeT: number;
  stealCool: number;
  pickupCool: number;
  /** juke bookkeeping */
  lastMx: number;
  lastMz: number;
  jukeCool: number;
  /** seconds since this player caught a pass (drives the catch pose) */
  catchT: number;
  /** stumble flavour for the animator */
  stumbleKind: 'ankle' | 'poster' | 'stuffed' | 'bump';
  /** a quick tap started this shot: release it automatically at the top */
  autoRelease: boolean;
  /** result of the last steal swipe, for recovery time */
  stealHit: boolean;
  celebrate: number;
  handSwitchT: number;
  ai: AiMemory;
  /** how this player moves */
  feel: Handling;
  /** flame meter, 0..FIRE.max */
  heat: number;
  /** seconds of live play left on fire, 0 when not on fire */
  fireT: number;
  /** good plays in a row */
  streak: number;
  /** seconds of live play since the last good play */
  streakT: number;
}

export type BallState = 'held' | 'pass' | 'shot' | 'loose' | 'dead';

export interface BallSim {
  state: BallState;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holder: number;
  /** last player to control the ball */
  lastHolder: number;
  // shot
  shooter: number;
  points: 2 | 3;
  planned: boolean;
  ghost: boolean;
  perfect: boolean;
  fromShot: boolean;
  shotTeam: TeamId;
  kind: 'jumper' | 'layup' | 'dunk' | 'oop';
  /** the game clock had expired when this shot was released */
  afterBuzzer: boolean;
  // pass
  fx: number;
  fy: number;
  fz: number;
  to: number;
  s: number;
  passDur: number;
  lob: number;
  passer: number;
  passTime: number;
  checked: boolean[];
  /** spin for the renderer (radians) */
  spin: number;
  /** seconds since last floor bounce event (throttle) */
  bounceT: number;
  /** seconds the ball has been loose */
  looseT: number;
}

export type Phase = 'countdown' | 'live' | 'scored' | 'inbound' | 'whistle' | 'periodEnd' | 'final';

export interface PlayerStats {
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  dunks: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  perfects: number;
}

export type SimEvent =
  | { type: 'shot'; by: number; three: boolean; grade: ShotGrade; contest: number }
  | { type: 'score'; by: number; team: TeamId; points: number; kind: BallSim['kind']; perfect: boolean; buzzer: boolean; assist: number }
  | { type: 'rim'; speed: number; hoop: number }
  | { type: 'board'; speed: number; hoop: number }
  | { type: 'bounce'; speed: number }
  /** the ball hits the floor on a dribble */
  | { type: 'dribble'; by: number }
  | { type: 'pass'; by: number; to: number; lob: boolean }
  | { type: 'catch'; by: number }
  | { type: 'swipe'; by: number }
  | { type: 'steal'; by: number; from: number; intercept: boolean }
  | { type: 'block'; by: number; on: number; stuffed: boolean }
  | { type: 'rebound'; by: number; offensive: boolean }
  | { type: 'pickup'; by: number }
  | { type: 'ankle'; by: number; victim: number }
  | { type: 'poster'; by: number; victim: number }
  | { type: 'jump'; by: number }
  | { type: 'land'; by: number; hard: boolean }
  | { type: 'dunkStart'; by: number; style: DunkStyle; oop: boolean }
  | { type: 'hype'; team: TeamId; on: boolean }
  /** a player catches fire, or the fire goes out (time is up, or the other team scored) */
  | { type: 'fire'; player: number; on: boolean }
  | { type: 'possession'; team: TeamId }
  | { type: 'shotClock'; team: TeamId }
  | { type: 'inbound'; team: TeamId }
  | { type: 'period'; quarter: number; start: boolean; overtime: boolean }
  | { type: 'tick'; seconds: number }
  | { type: 'final'; winner: TeamId };

export type ShotGrade = 'perfect' | 'good' | 'ok' | 'bad';

export interface MatchState {
  cfg: MatchConfig;
  rng: number;
  tick: number;
  phase: Phase;
  phaseT: number;
  quarter: number;
  overtime: boolean;
  clock: number;
  shotClock: number;
  score: [number, number];
  /** team with the ball, or the team that last had it while it is loose */
  possession: TeamId;
  /** next team to inbound after a stoppage */
  inboundTeam: TeamId;
  players: PlayerSim[];
  ball: BallSim;
  /** index of the player the person controls, -1 when none */
  control: number;
  hype: [number, number];
  hypeT: [number, number];
  stats: PlayerStats[];
  events: SimEvent[];
  winner: -1 | TeamId;
  /** consecutive makes without the other team scoring, per team (streak callouts) */
  run: [number, number];
  /** hoop shake / net motion hints: seconds since the last score at each hoop */
  lastScoreT: [number, number];
  lastScoreBy: number;
  perTeam: number;
  /** pad buttons last tick, for edge detection */
  padA: boolean;
  padB: boolean;
  padSw: boolean;
  /** changes whenever the ball changes hands or state, drives defender auto switch */
  ctrlKey: string;
  /**
   * The second person in a two-player game: the human team that is not `cfg.userTeam`. The match itself is the
   * first person's seat (`control`, `padA` and the rest above); `second.control` is -1 when nobody else plays.
   */
  second: Seat;
  time: number;
}
