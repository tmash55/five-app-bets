import { readFileSync } from 'fs';
import { join } from 'path';

import { SFX_FILES } from '@/audio/files';
import { playSfx } from '@/audio/sound';
import { createMatch } from '@/game/sim/sim';
import type { Attrs, MatchConfig, MatchState } from '@/game/sim/types';

import { MATCH_SOUNDS, MatchDirector } from '../director';

jest.mock('@/audio/sound', () => ({ playSfx: jest.fn() }));
jest.mock('@/fx/feedback', () => ({ buzz: jest.fn() }));

const sfx = playSfx as jest.MockedFunction<typeof playSfx>;

const attrs = (): Attrs => ({ speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5 });

function match(userTeam: -1 | 0 | 1 = 0): MatchState {
  const team = () => ({ players: [{ id: 'a', attrs: attrs() }, { id: 'b', attrs: attrs() }, { id: 'c', attrs: attrs() }] });
  const cfg: MatchConfig = { seed: 7, teams: [team(), team()], userTeam, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand: 0, autoSwitch: true };
  const m = createMatch(cfg);
  m.phase = 'live';
  for (const p of m.players) {
    p.state = 'free';
    p.y = 0;
    p.vx = 0;
    p.vz = 0;
  }
  return m;
}

function director(show: (c: { text: string }) => void = () => undefined): MatchDirector {
  return new MatchDirector({ names: ['A', 'B', 'C', 'D', 'E', 'F'], quarters: 4, show });
}

const heard = (name: string) => sfx.mock.calls.filter((c) => c[0] === name);

/** One simulation step of the sneaker listener, a sixtieth of a second on. */
function step(d: MatchDirector, m: MatchState): void {
  m.time += 1 / 60;
  d.watch(m);
}

beforeEach(() => sfx.mockClear());

describe('the sounds of a match', () => {
  test('every sound the director plays is one the match screen gets ready, and every one of those exists', () => {
    const source = readFileSync(join(__dirname, '..', 'director.ts'), 'utf8');
    const played = new Set<string>();
    for (const hit of source.matchAll(/'([A-Za-z]+)'/g)) if (hit[1] in SFX_FILES) played.add(hit[1]);
    expect(played.size).toBeGreaterThan(20);
    expect([...played].sort()).toEqual([...MATCH_SOUNDS].sort());
    expect(new Set(MATCH_SOUNDS).size).toBe(MATCH_SOUNDS.length);
  });
});

describe('the kids watching', () => {
  const ours = 0;
  const theirs = 3;

  test('groan when the person’s shot comes off the rim and is rebounded', () => {
    const m = match();
    const d = director();
    expect(m.players[ours].team).toBe(0);
    d.handle({ type: 'shot', by: ours, three: false, grade: 'ok', contest: 0 }, m);
    d.handle({ type: 'rim', speed: 4, hoop: 1 }, m);
    d.handle({ type: 'rebound', by: theirs, offensive: false }, m);
    expect(heard('aww')).toHaveLength(1);
  });

  test('stay quiet for an air ball, a made shot, a block, and the other team’s miss', () => {
    const m = match();
    const d = director();
    // never touched the rim
    d.handle({ type: 'shot', by: ours, three: false, grade: 'bad', contest: 0 }, m);
    d.handle({ type: 'rebound', by: theirs, offensive: false }, m);
    // rattled in
    d.handle({ type: 'shot', by: ours, three: false, grade: 'ok', contest: 0 }, m);
    d.handle({ type: 'rim', speed: 3, hoop: 1 }, m);
    d.handle({ type: 'score', by: ours, team: 0, points: 2, kind: 'jumper', perfect: false, buzzer: false, assist: -1 }, m);
    d.handle({ type: 'rebound', by: theirs, offensive: false }, m);
    // swatted away
    d.handle({ type: 'shot', by: ours, three: false, grade: 'ok', contest: 1 }, m);
    d.handle({ type: 'block', by: theirs, on: ours, stuffed: false }, m);
    d.handle({ type: 'rim', speed: 2, hoop: 1 }, m);
    d.handle({ type: 'rebound', by: theirs, offensive: false }, m);
    // their miss
    d.handle({ type: 'shot', by: theirs, three: false, grade: 'ok', contest: 0 }, m);
    d.handle({ type: 'rim', speed: 4, hoop: 0 }, m);
    d.handle({ type: 'rebound', by: ours, offensive: false }, m);
    expect(heard('aww')).toHaveLength(0);
  });

  test('do not groan again right away', () => {
    const m = match();
    const d = director();
    const miss = () => {
      d.handle({ type: 'shot', by: ours, three: false, grade: 'ok', contest: 0 }, m);
      d.handle({ type: 'rim', speed: 4, hoop: 1 }, m);
      d.handle({ type: 'rebound', by: ours, offensive: true }, m);
    };
    miss();
    m.time += 3;
    miss();
    expect(heard('aww')).toHaveLength(1);
    m.time += 7;
    miss();
    expect(heard('aww')).toHaveLength(2);
  });
});

describe('dribbles', () => {
  test('a sprint pounds the ball harder than a walk, and the person’s team is heard best', () => {
    const m = match();
    const d = director();
    const level = (by: number, speed: number) => {
      sfx.mockClear();
      m.players[by].vx = speed;
      d.handle({ type: 'dribble', by }, m);
      return heard('dribble')[0][1] as number;
    };
    expect(level(0, 7)).toBeGreaterThan(level(0, 1));
    expect(level(0, 7)).toBeLessThanOrEqual(1);
    expect(level(0, 4)).toBeGreaterThan(level(3, 4));
  });
});

describe('sneakers', () => {
  /** runs a player at speed for a while, then stops them dead */
  function hardStop(d: MatchDirector, m: MatchState, who: number): void {
    m.players[who].vx = 6.5;
    for (let i = 0; i < 20; i++) step(d, m);
    m.players[who].vx = 0;
    for (let i = 0; i < 12; i++) step(d, m);
  }

  test('the player in the person’s hands scrapes the court on a hard stop, once', () => {
    const m = match();
    const d = director();
    m.control = 0;
    hardStop(d, m, 0);
    expect(heard('scuff')).toHaveLength(1);
    expect(heard('scuff')[0][1]).toBeGreaterThan(0.5);
  });

  test('speeding up, coasting and standing still are silent', () => {
    const m = match();
    const d = director();
    m.control = 0;
    for (let i = 0; i < 30; i++) step(d, m);
    m.players[0].vx = 3;
    for (let i = 0; i < 30; i++) step(d, m);
    m.players[0].vx = 7;
    for (let i = 0; i < 30; i++) step(d, m);
    expect(heard('scuff')).toHaveLength(0);
  });

  test('a turn back at speed scrapes too, and a jump or a stopped game does not', () => {
    const m = match();
    const d = director();
    m.control = 0;
    m.players[0].vx = 6;
    for (let i = 0; i < 20; i++) step(d, m);
    m.players[0].vx = -6;
    for (let i = 0; i < 12; i++) step(d, m);
    expect(heard('scuff')).toHaveLength(1);

    sfx.mockClear();
    m.time += 5;
    m.players[0].y = 0.4;
    hardStop(d, m, 0);
    m.players[0].y = 0;
    m.phase = 'whistle';
    m.time += 5;
    hardStop(d, m, 0);
    expect(heard('scuff')).toHaveLength(0);
  });

  test('everyone else together is heard only now and then, and more quietly', () => {
    const m = match();
    const d = director();
    m.control = 0;
    // three others stop hard at the same moment, again and again for three seconds
    for (let round = 0; round < 6; round++) {
      for (const who of [1, 3, 4]) m.players[who].vx = 6.5;
      for (let i = 0; i < 18; i++) step(d, m);
      for (const who of [1, 3, 4]) m.players[who].vx = 0;
      for (let i = 0; i < 12; i++) step(d, m);
    }
    const scuffs = heard('scuff');
    expect(scuffs.length).toBeGreaterThanOrEqual(1);
    expect(scuffs.length).toBeLessThanOrEqual(2);
    expect(scuffs.every((c) => (c[1] as number) < 0.5)).toBe(true);
  });
});

describe('the horn', () => {
  /** The person's team (or the other one) scores as time runs out, leaving the score at `after`. */
  function atTheHorn(quarter: number, after: [number, number], points: number, team: 0 | 1 = 0) {
    const m = match();
    const said: string[] = [];
    const d = director((c) => said.push(c.text));
    m.quarter = quarter;
    m.clock = 0;
    m.score[0] = after[0];
    m.score[1] = after[1];
    d.handle({ type: 'score', by: team === 0 ? 0 : 3, team, points, kind: 'jumper', perfect: false, buzzer: true, assist: -1 }, m);
    return { d, said };
  }

  test('a shot that wins the game or ties it at the last horn makes the headline', () => {
    // down one, a two wins it
    expect(atTheHorn(4, [21, 20], 2).d.buzzerBeater).toBe(true);
    // level, a two wins it
    expect(atTheHorn(4, [22, 20], 2).d.buzzerBeater).toBe(true);
    // down three, a three sends it to overtime
    expect(atTheHorn(4, [20, 20], 3).d.buzzerBeater).toBe(true);
  });

  test('a shot at an earlier horn, or one the team did not need, is called out but is not the headline', () => {
    const early = atTheHorn(2, [12, 11], 2);
    expect(early.said).toContain('BUZZER BEATER!');
    expect(early.d.buzzerBeater).toBe(false);
    // already ahead before the shot
    const spare = atTheHorn(4, [25, 20], 2);
    expect(spare.said).toContain('BUZZER BEATER!');
    expect(spare.d.buzzerBeater).toBe(false);
    // still behind after it
    expect(atTheHorn(4, [18, 20], 2).d.buzzerBeater).toBe(false);
    // the other team's winner
    expect(atTheHorn(4, [20, 21], 2, 1).d.buzzerBeater).toBe(false);
  });

  test('sounds once when the game ends, and at the end of every earlier quarter', () => {
    const m = match();
    const d = director();
    m.quarter = 1;
    d.handle({ type: 'period', quarter: 1, start: false, overtime: false }, m);
    expect(heard('buzzer')).toHaveLength(1);
    // the last quarter ends and the game with it, in the same step
    m.quarter = 4;
    m.score[0] = 21;
    m.score[1] = 20;
    m.phase = 'final';
    m.winner = 0;
    d.handle({ type: 'period', quarter: 4, start: false, overtime: false }, m);
    d.handle({ type: 'final', winner: 0 }, m);
    expect(heard('buzzer')).toHaveLength(2);
  });

  test('still sounds when the last quarter ends level and overtime follows', () => {
    const m = match();
    const said: string[] = [];
    const d = director((c) => said.push(c.text));
    m.quarter = 4;
    m.phase = 'periodEnd';
    d.handle({ type: 'period', quarter: 4, start: false, overtime: false }, m);
    expect(heard('buzzer')).toHaveLength(1);
    expect(said).toEqual(['END OF Q4']);
  });
});

describe('fire', () => {
  type Shown = { text: string; tone?: string; sub?: string };

  test('a player catching fire gets a big callout of their own and the ignite sound, for either team', () => {
    for (const who of [0, 4]) {
      sfx.mockClear();
      const m = match();
      const shown: Shown[] = [];
      const d = director((c) => shown.push(c));
      d.handle({ type: 'fire', player: who, on: true }, m);
      expect(heard('ignite')).toHaveLength(1);
      expect(shown).toHaveLength(1);
      expect(shown[0].tone).toBe('fire');
      expect(shown[0].sub).toBe(['A', 'B', 'C', 'D', 'E', 'F'][who]);
      // the fire going out is quiet
      d.handle({ type: 'fire', player: who, on: false }, m);
      expect(shown).toHaveLength(1);
      expect(heard('ignite')).toHaveLength(1);
    }
  });

  test('a basket that lights a player is called first, and the fire a moment later', () => {
    const m = match();
    const shown: Shown[] = [];
    const d = director((c) => shown.push(c));
    d.handle({ type: 'score', by: 0, team: 0, points: 3, kind: 'jumper', perfect: false, buzzer: false, assist: -1 }, m);
    d.handle({ type: 'fire', player: 0, on: true }, m);
    expect(shown).toHaveLength(1);
    expect(shown[0].tone).not.toBe('fire');
    for (let i = 0; i < 30; i++) step(d, m);
    expect(shown).toHaveLength(1);
    for (let i = 0; i < 30; i++) step(d, m);
    expect(shown).toHaveLength(2);
    expect(shown[1].tone).toBe('fire');
  });

  test('shots and dunks by a player on fire crackle, and nobody else’s do', () => {
    const m = match();
    const d = director();
    d.handle({ type: 'shot', by: 1, three: false, grade: 'ok', contest: 0 }, m);
    d.handle({ type: 'dunkStart', by: 1, style: 'twoHand', oop: false }, m);
    expect(heard('fireShot')).toHaveLength(0);
    m.players[1].fireT = 5;
    d.handle({ type: 'shot', by: 1, three: false, grade: 'ok', contest: 0 }, m);
    d.handle({ type: 'dunkStart', by: 1, style: 'twoHand', oop: false }, m);
    expect(heard('fireShot')).toHaveLength(2);
  });
});
