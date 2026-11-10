import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundSummary } from '@five/game';

import { addDays, dateKey, dayNumber } from '@/skills/dates';
import { GAME_SKILLS, readFocusSkills, saveFocusSkills } from '@/skills/focusSkills';
import {
  changeSinceLastWeek,
  MAX_SNAPSHOTS,
  readSkillHistory,
  recordSkillRound,
  skillSeries,
  withScoresOn,
} from '@/skills/history';
import { applyRound, blendScore, rateRound } from '@/skills/skills';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const summary = (overrides: Partial<RoundSummary> = {}): RoundSummary => ({
  score: 1000,
  accuracyPoints: 1000,
  speedPoints: 250,
  answered: 10,
  correct: 10,
  accuracy: 1,
  averageCorrectMs: 900,
  startLevel: 1,
  finalLevel: 5,
  highestLevel: 5,
  longestStreak: 10,
  ...overrides,
});
const game = { levels: 9 };

beforeEach(() => AsyncStorage.clear());

describe('dates', () => {
  it('uses local calendar days and steps across months', () => {
    expect(dateKey(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(addDays('2026-11-03', -7)).toBe('2026-10-27');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayNumber('2026-11-11') - dayNumber('2026-11-10')).toBe(1);
  });
});

describe('rateRound', () => {
  it('rates skill from the level reached and accuracy', () => {
    // Level 5 of 9 is halfway: 0.7 * 0.5 + 0.3 * 1.
    expect(rateRound(game, summary()).skill).toBe(650);
    expect(rateRound(game, summary({ finalLevel: 9, highestLevel: 9 })).skill).toBe(1000);
    expect(rateRound(game, summary({ finalLevel: 1, highestLevel: 1, accuracy: 0.5 })).skill).toBe(150);
    // Dropping back from the highest level counts half.
    expect(rateRound(game, summary({ finalLevel: 3, highestLevel: 7 })).skill).toBe(650);
  });

  it('rates speed as the average speed bonus share of right answers', () => {
    // 250 of a possible 500 bonus points on 1000 accuracy points is half speed.
    expect(rateRound(game, summary()).speed).toBe(500);
    expect(rateRound(game, summary({ speedPoints: 0 })).speed).toBe(0);
    // A game with its own scoring is read with its own numbers.
    expect(rateRound({ levels: 9, scoring: { maxSpeedBonus: 100 } }, summary()).speed).toBe(250);
  });

  it('says nothing about a round with no answers or no right answers', () => {
    expect(rateRound(game, summary({ answered: 0 }))).toEqual({ skill: null, speed: null });
    expect(rateRound(game, summary({ accuracyPoints: 0, speedPoints: 0, accuracy: 0 })).speed).toBeNull();
  });
});

describe('scores', () => {
  it('sets the first score and then moves 30% toward each new rating', () => {
    expect(blendScore(undefined, 600)).toBe(600);
    expect(blendScore(600, 700)).toBe(630);
    expect(blendScore(600, 500)).toBe(570);
  });

  it('updates the game skill and speed, leaving the others', () => {
    expect(applyRound({ words: 400 }, 'math', { skill: 650, speed: 500 })).toEqual({
      words: 400,
      math: 650,
      speed: 500,
    });
    expect(applyRound({ math: 600 }, 'math', { skill: null, speed: null })).toEqual({ math: 600 });
  });
});

describe('history', () => {
  it('records each round into one snapshot per day', async () => {
    await recordSkillRound(game, 'memory', summary(), '2026-11-01');
    await recordSkillRound(game, 'math', summary({ finalLevel: 9, highestLevel: 9 }), '2026-11-01');
    await recordSkillRound(game, 'memory', summary({ finalLevel: 9, highestLevel: 9 }), '2026-11-02');
    const history = await readSkillHistory();
    expect(history).toEqual([
      { date: '2026-11-01', scores: { memory: 650, math: 1000, speed: 500 } },
      { date: '2026-11-02', scores: { memory: 755, math: 1000, speed: 500 } },
    ]);
  });

  it('keeps about a year of days', async () => {
    let history = withScoresOn([], '2025-01-01', { memory: 1 });
    for (let i = 1; i < MAX_SNAPSHOTS; i++) history = withScoresOn(history, addDays('2025-01-01', i), { memory: i });
    await AsyncStorage.setItem('keen.skills.history', JSON.stringify(history));
    await recordSkillRound(game, 'memory', summary(), '2026-11-10');
    const saved = await readSkillHistory();
    expect(saved).toHaveLength(MAX_SNAPSHOTS);
    expect(saved[0].date).toBe('2025-01-02');
    expect(saved.at(-1)?.date).toBe('2026-11-10');
  });

  it('compares with the latest score at least a week old', () => {
    const history = [
      { date: '2026-11-01', scores: { memory: 500, speed: 400 } },
      { date: '2026-11-03', scores: { memory: 520, speed: 410 } },
      { date: '2026-11-08', scores: { memory: 560, speed: 400, math: 300 } },
    ];
    expect(changeSinceLastWeek(history, '2026-11-10')).toEqual({ memory: 40, speed: -10, math: null });
    // Nothing a week old yet: no change to show.
    expect(changeSinceLastWeek(history, '2026-11-07')).toEqual({ memory: null, speed: null, math: null });
  });

  it('gives each skill chart the days that have that skill', () => {
    const history = [
      { date: '2026-11-01', scores: { memory: 500 } },
      { date: '2026-11-02', scores: { memory: 520, math: 300 } },
      { date: '2026-11-03', scores: { memory: 540, math: 330 } },
    ];
    expect(skillSeries(history, 'math')).toEqual([
      { date: '2026-11-02', score: 300 },
      { date: '2026-11-03', score: 330 },
    ]);
    expect(skillSeries(history, 'memory', 1)).toEqual([{ date: '2026-11-03', score: 540 }]);
    expect(skillSeries(history, 'words')).toEqual([]);
  });

  it('survives a corrupt store', async () => {
    await AsyncStorage.setItem('keen.skills.history', '{oops');
    expect(await readSkillHistory()).toEqual([]);
  });
});

describe('focus skills', () => {
  it('defaults to every game skill and keeps a saved choice', async () => {
    expect(await readFocusSkills()).toEqual(GAME_SKILLS);
    await saveFocusSkills(['words', 'math']);
    expect(await readFocusSkills()).toEqual(['words', 'math']);
    await AsyncStorage.setItem('keen.focusSkills', JSON.stringify(['speed', 'juggling']));
    expect(await readFocusSkills()).toEqual(GAME_SKILLS);
  });
});
