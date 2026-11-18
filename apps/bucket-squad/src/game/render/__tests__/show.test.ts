import { BALL_R } from '../../sim/constants';
import { EASY, POUND, easyPattern, patternLength, poundPattern } from '../../stage/ballPath';
import { ACT_LENGTH, ROLE_ACTS, ROLE_HAS_BALL, actAt, type StageAct, type StageRole } from '../../stage/director';
import { FigureAnimator, type ShowFrame } from '../animator';

const DT = 1 / 60;
const BONES = 64 * 16;
/** the hand mesh: how far the fingertips and the middle of the palm are from the wrist pivot */
const TIP = 0.13;
const PALM_MID = 0.07;

interface Probe {
  /** worst distance a planted ankle moved while it stayed planted */
  slide: number;
  /** highest a planted ankle was off the floor */
  plantedHigh: number;
  /** lowest the ball's centre went */
  ballLow: number;
  /** biggest jump of the ball between two frames */
  ballJump: number;
  /** worst gap between a hand the act says is on the ball and the ball's surface */
  gripGap: number;
  /** worst gap between the fingertip and the bottom of a ball spinning on it */
  tipGap: number;
  nonFinite: number;
  frames: number;
}

function frame(role: StageRole): ShowFrame {
  const side = role === 'captain' ? 0 : role === 'stretcher' ? -1 : 1;
  return {
    act: 'enter',
    t: 0,
    dur: 1,
    index: 0,
    x: side * 0.9,
    z: side === 0 ? 0.36 : -0.3,
    facing: Math.PI / 2 - side * -0.3,
    hasBall: ROLE_HAS_BALL[role],
    hand: side === 0 ? -1 : side,
    side,
    variety: 0,
    camX: 0,
    camY: 1.9,
    camZ: 12,
    palX: 0,
    palY: 1.2,
    palZ: 0.36,
    dt: DT,
    time: 0,
  };
}

const w = new Float64Array(3);
const w2 = new Float64Array(3);

/** Runs `next(time)` for `seconds` at 60 Hz and measures what the act promises. */
function run(role: StageRole, seconds: number, next: (f: ShowFrame, time: number) => void, height = 1): Probe {
  const an = new FigureAnimator({ height, bulk: 1, head: 1 }, null, null, 1);
  const bones = new Float32Array(BONES);
  const f = frame(role);
  const p: Probe = { slide: 0, plantedHigh: 0, ballLow: 9, ballJump: 0, gripGap: 0, tipGap: 0, nonFinite: 0, frames: 0 };
  const plantAt = [new Float64Array(3), new Float64Array(3)];
  let plantedBefore = 0;
  let index = NaN;
  const last = new Float64Array(3);
  let haveLast = false;
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k++) {
    const time = k * DT;
    f.time = time;
    next(f, time);
    an.updateShow(f, bones);
    p.frames++;
    for (let i = 0; i < bones.length; i++) if (!Number.isFinite(bones[i])) p.nonFinite++;
    // a new act starts with fresh feet: only measure sliding inside one act
    if (f.index !== index) {
      index = f.index;
      plantedBefore = 0;
    }
    for (let s = 0; s < 2; s++) {
      const bit = 1 << s;
      an.toWorld(an.ankles[s * 3], an.ankles[s * 3 + 1], an.ankles[s * 3 + 2], w);
      if (an.planted & bit && !an.hidden) {
        p.plantedHigh = Math.max(p.plantedHigh, an.ankles[s * 3 + 1] * an.sy + an.lift);
        if (plantedBefore & bit) p.slide = Math.max(p.slide, Math.hypot(w[0] - plantAt[s][0], w[2] - plantAt[s][2]));
        else plantAt[s].set(w);
      }
    }
    plantedBefore = an.hidden ? 0 : an.planted;
    if (f.hasBall && !an.hidden) {
      const b = an.ball;
      p.ballLow = Math.min(p.ballLow, b[1]);
      // measured against the figure, so a figure dropping onto the base with the ball is not a jump
      const by = b[1] - an.lift;
      if (haveLast) p.ballJump = Math.max(p.ballJump, Math.hypot(b[0] - last[0], by - last[1], b[2] - last[2]));
      last[0] = b[0];
      last[1] = by;
      last[2] = b[2];
      haveLast = true;
      for (let s = 0; s < 2; s++) {
        const o = s * 7;
        const h = an.hands;
        if (an.contact & (1 << s)) {
          an.toWorld(h[o] + h[o + 3] * PALM_MID * h[o + 6], h[o + 1] + h[o + 4] * PALM_MID * h[o + 6], h[o + 2] + h[o + 5] * PALM_MID * h[o + 6], w2);
          p.gripGap = Math.max(p.gripGap, Math.abs(Math.hypot(w2[0] - b[0], w2[1] - b[1], w2[2] - b[2]) - BALL_R));
        }
      }
      if (an.contact & 4) {
        const o = f.hand > 0 ? 0 : 7;
        const h = an.hands;
        an.toWorld(h[o] + h[o + 3] * TIP * h[o + 6], h[o + 1] + h[o + 4] * TIP * h[o + 6], h[o + 2] + h[o + 5] * TIP * h[o + 6], w2);
        p.tipGap = Math.max(p.tipGap, Math.abs(Math.hypot(w2[0] - b[0], w2[1] - b[1], w2[2] - b[2]) - BALL_R));
      }
    } else {
      haveLast = false;
    }
  }
  return p;
}

/** One act, over and over, for 12 seconds. */
function repeat(role: StageRole, act: StageAct, height = 1): Probe {
  const dur = ACT_LENGTH[act];
  return run(
    role,
    12,
    (f, time) => {
      const k = Math.floor(time / dur);
      f.act = act;
      f.t = time - k * dur;
      f.dur = dur;
      f.index = k;
      f.variety = k;
    },
    height,
  );
}

const CASES: [StageRole, StageAct][] = [];
for (const role of ['captain', 'stretcher', 'handler'] as StageRole[]) {
  for (const act of ['enter', 'hey', ...ROLE_ACTS[role]] as StageAct[]) CASES.push([role, act]);
}

describe('warm-up show path', () => {
  it.each(CASES)('%s: %s holds together for 12 s', (role, act) => {
    for (const height of [0.92, 1.08]) {
      const p = repeat(role, act, height);
      expect(p.nonFinite).toBe(0);
      // planted feet stay put and on the floor
      expect(p.slide).toBeLessThan(0.012);
      expect(p.plantedHigh).toBeLessThan(0.16);
      if (ROLE_HAS_BALL[role]) {
        expect(p.ballLow).toBeGreaterThanOrEqual(BALL_R - 1e-6);
        // a hand the act says is on the ball is on its surface; a spinning ball sits on the fingertip
        expect(p.gripGap).toBeLessThan(0.075);
        expect(p.tipGap).toBeLessThan(0.05);
        // no teleports, even where the act repeats (the entrance starts in the air, so it never follows itself)
        if (act !== 'enter') expect(p.ballJump).toBeLessThan(0.16);
      }
    }
  });

  it.each(['captain', 'stretcher', 'handler'] as StageRole[])('%s: two minutes of the playlist, no jumps between acts', (role) => {
    const actor = role === 'captain' ? 0 : role === 'stretcher' ? 1 : 2;
    const slot = { act: 'enter' as StageAct, t: 0, dur: 1, start: 0, index: 0 };
    const p = run(role, 120, (f, time) => {
      actAt(99, actor, role, time, slot);
      f.act = slot.act;
      f.t = slot.t;
      f.dur = slot.dur;
      f.index = slot.index;
    });
    expect(p.nonFinite).toBe(0);
    expect(p.slide).toBeLessThan(0.012);
    if (ROLE_HAS_BALL[role]) {
      expect(p.ballLow).toBeGreaterThanOrEqual(BALL_R - 1e-6);
      expect(p.ballJump).toBeLessThan(0.16);
    }
  });

  it('fits every dribble pattern inside its act', () => {
    for (const h of [1, -1]) {
      expect(patternLength(poundPattern(h), POUND)).toBeLessThanOrEqual(ACT_LENGTH.pound);
      expect(patternLength(easyPattern(h), EASY)).toBeLessThanOrEqual(ACT_LENGTH.dribble);
    }
  });
});
