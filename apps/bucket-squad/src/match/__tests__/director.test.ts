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

function director(): MatchDirector {
  return new MatchDirector({ names: ['A', 'B', 'C', 'D', 'E', 'F'], quarters: 4, show: () => undefined });
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
