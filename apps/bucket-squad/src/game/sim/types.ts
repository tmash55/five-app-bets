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
}

export interface TeamSetup {
  players: PlayerSetup[];
}

export interface MatchConfig {
  seed: number;
  teams: [TeamSetup, TeamSetup];
  /** which team the person controls, -1 for a computer-only match */
  userTeam: -1 | TeamId;
  quarters: number;
  quarterSeconds: number;
  /** 0..1 skill of the computer opponents */
  difficulty: number;
  /** 0..1 skill of computer-controlled players on the person's own team */
  mateSkill: number;
  /** widens the perfect-release window for the person (1 = standard) */
  timingAssist: number;
  /** keep matches close: 0 none, 1 strong */
  rubberBand: number;
  autoSwitch: boolean;
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
  time: number;
}
