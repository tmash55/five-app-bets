import { ACT_LENGTH, ENTER_STAGGER, ROLE_ACTS, actAt, enterLength, nextActStart, rolesFor, type StageRole } from '../director';

const ROLES: StageRole[] = ['captain', 'stretcher', 'handler'];
const SEEDS = [0, 1, 7, 12345, 0xdeadbeef, 2166136261];

/** every act an actor plays from the entrance on, in order, until `until` seconds */
function playlist(seed: number, actor: number, role: StageRole, until: number) {
  const out: { act: string; start: number; dur: number; index: number }[] = [];
  let t = 0;
  while (t < until) {
    const s = actAt(seed, actor, role, t);
    out.push({ act: s.act, start: s.start, dur: s.dur, index: s.index });
    t = s.start + s.dur + 1e-6;
  }
  return out;
}

describe('warm-up director', () => {
  it('gives the same act for the same inputs', () => {
    for (const seed of SEEDS) {
      for (const role of ROLES) {
        for (let t = -1; t < 120; t += 0.37) {
          const a = actAt(seed, 1, role, t);
          const b = actAt(seed, 1, role, t);
          expect(b).toEqual(a);
        }
      }
    }
  });

  it('lands everyone first, one after another', () => {
    expect(actAt(1, 0, 'captain', -5).act).toBe('enter');
    for (let actor = 0; actor < 3; actor++) {
      expect(enterLength(actor)).toBeCloseTo(ACT_LENGTH.enter + actor * ENTER_STAGGER);
      expect(actAt(9, actor, rolesFor(3)[actor], enterLength(actor) - 0.01).act).toBe('enter');
      expect(actAt(9, actor, rolesFor(3)[actor], enterLength(actor) + 0.01).act).not.toBe('enter');
    }
  });

  it('opens with the role signature move', () => {
    for (const seed of SEEDS) {
      expect(actAt(seed, 0, 'captain', 2).act).toBe('spin');
      expect(actAt(seed, 1, 'stretcher', 2).act).toBe('armCross');
      expect(actAt(seed, 2, 'handler', 2).act).toBe('dribble');
    }
  });

  it('plays every act once a round, shuffled, never the same act twice in a row', () => {
    for (const seed of SEEDS) {
      for (const role of ROLES) {
        const acts = ROLE_ACTS[role];
        const list = playlist(seed, 1, role, 600).slice(1);
        const orders = new Set<string>();
        for (let r = 0; r + acts.length <= list.length; r += acts.length) {
          const round = list.slice(r, r + acts.length).map((s) => s.act);
          expect([...round].sort()).toEqual([...acts].sort());
          orders.add(round.join());
        }
        // shuffled: more than one order shows up over a long show
        expect(orders.size).toBeGreaterThan(1);
        for (let i = 1; i < list.length; i++) expect(list[i].act).not.toBe(list[i - 1].act);
      }
    }
  });

  it('tiles time with no gaps, each act at its own length', () => {
    for (const role of ROLES) {
      const list = playlist(42, 2, role, 300);
      for (let i = 1; i < list.length; i++) {
        expect(list[i].start).toBeCloseTo(list[i - 1].start + list[i - 1].dur, 6);
        expect(list[i].index).toBe(list[i - 1].index + 1);
        expect(list[i].dur).toBeCloseTo(ACT_LENGTH[list[i].act as keyof typeof ACT_LENGTH], 6);
      }
      const t = 77.7;
      expect(nextActStart(42, 2, role, t)).toBeGreaterThan(t);
    }
  });

  it('keeps working far into a long session', () => {
    const s = actAt(3, 1, 'stretcher', 86400 * 3);
    expect(ROLE_ACTS.stretcher).toContain(s.act);
    expect(s.t).toBeGreaterThanOrEqual(0);
    expect(s.t).toBeLessThanOrEqual(s.dur);
  });

  it('gives a group of three the three roles', () => {
    expect(rolesFor(3)).toEqual(['captain', 'stretcher', 'handler']);
    expect(rolesFor(2)).toEqual(['captain', 'stretcher']);
  });
});
