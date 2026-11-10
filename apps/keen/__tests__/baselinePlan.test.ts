import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundSummary } from '@five/game';
import { validateQuizConfig } from '@five/shell';

import {
  BASELINE_GAMES,
  readBaseline,
  saveBaseline,
  scoreBaseline,
  weakestSkill,
} from '@/baseline/baseline';
import { shareMessage } from '@/baseline/shareBaseline';
import { KEEN_GAMES } from '@/games';
import {
  buildPlan,
  focusSkillsFromAnswers,
  ratingForScore,
  selfRatingInsight,
} from '@/onboarding/plan';
import { onboardingQuiz } from '@/onboarding/quiz';
import { addDays, dateKey } from '@/skills/dates';
import { GAME_SKILLS } from '@/skills/focusSkills';
import { readSkillHistory } from '@/skills/history';
import { rateRound } from '@/skills/skills';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({
  giveFeedback: jest.fn(),
  preloadFeedback: jest.fn(),
  releaseFeedback: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const round = (overrides: Partial<RoundSummary> = {}): RoundSummary => ({
  score: 800,
  accuracyPoints: 700,
  speedPoints: 140,
  answered: 8,
  correct: 7,
  accuracy: 0.875,
  averageCorrectMs: 1200,
  startLevel: 1,
  finalLevel: 3,
  highestLevel: 3,
  longestStreak: 4,
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('onboarding quiz', () => {
  it('is a valid shell quiz with twelve questions', () => {
    expect(validateQuizConfig(onboardingQuiz)).toEqual([]);
    expect(onboardingQuiz.questions).toHaveLength(12);
  });

  it('asks about goals, time and a self-rating for every skill', () => {
    const ids = onboardingQuiz.questions.map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(['goal', 'focus_skills', 'minutes', 'days']));
    for (const skill of [...GAME_SKILLS, 'speed']) expect(ids).toContain(`rate_${skill}`);
  });

  it('offers exactly the game skills as focus skills', () => {
    const focus = onboardingQuiz.questions.find((q) => q.id === 'focus_skills');
    expect(focus?.type === 'multiple' && focus.options.map((o) => o.id)).toEqual(GAME_SKILLS);
  });
});

describe('baseline test', () => {
  it('uses the first two games, 30 seconds each, and leaves the real games alone', () => {
    expect(BASELINE_GAMES.map((g) => g.module.id)).toEqual(['pairs', 'quick-sum']);
    expect(BASELINE_GAMES.map((g) => g.module.round.durationMs)).toEqual([30_000, 30_000]);
    expect(KEEN_GAMES[0].module.round.durationMs).toBe(60_000);
    expect(BASELINE_GAMES[0].module.round.questionTimeLimitMs).toBe(KEEN_GAMES[0].module.round.questionTimeLimitMs);
  });

  it('scores memory and math from their games and speed as the average of both', () => {
    const pairsRound = round();
    const sumRound = round({ finalLevel: 5, highestLevel: 6, speedPoints: 50 });
    const result = scoreBaseline(
      [
        { gameId: 'pairs', summary: pairsRound },
        { gameId: 'quick-sum', summary: sumRound },
      ],
      '2026-11-10',
    );
    const pairsRating = rateRound(BASELINE_GAMES[0].module, pairsRound);
    const sumRating = rateRound(BASELINE_GAMES[1].module, sumRound);
    expect(result.scores).toEqual({
      memory: pairsRating.skill,
      math: sumRating.skill,
      speed: Math.round(((pairsRating.speed ?? 0) + (sumRating.speed ?? 0)) / 2),
    });
    const values = Object.values(result.scores) as number[];
    expect(result.keenScore).toBe(Math.round(values.reduce((a, b) => a + b, 0) / 3));
    expect(result.date).toBe('2026-11-10');
  });

  it('leaves a skill unscored when its round had no answers', () => {
    const result = scoreBaseline([
      { gameId: 'pairs', summary: round({ answered: 0, correct: 0, accuracy: 0, accuracyPoints: 0, speedPoints: 0 }) },
      { gameId: 'quick-sum', summary: round() },
    ]);
    expect(result.scores.memory).toBeUndefined();
    expect(result.scores.math).toBeDefined();
  });

  it('scores zero when nothing was answered at all', () => {
    expect(scoreBaseline([]).keenScore).toBe(0);
  });

  it('finds the weakest measured skill', () => {
    expect(weakestSkill({ memory: 400, math: 300, speed: 500 })).toBe('math');
    expect(weakestSkill({})).toBeNull();
  });

  it('saves the baseline and makes it the starting skill scores', async () => {
    const today = dateKey();
    await AsyncStorage.setItem(
      'keen.skills.history',
      JSON.stringify([{ date: addDays(today, -1), scores: { words: 450, memory: 100 } }]),
    );
    const result = scoreBaseline([{ gameId: 'pairs', summary: round() }], today);
    await saveBaseline(result);

    expect(await readBaseline()).toEqual(result);
    const history = await readSkillHistory();
    expect(history.at(-1)).toEqual({ date: today, scores: { words: 450, ...result.scores } });
  });

  it('reads no baseline before the test', async () => {
    expect(await readBaseline()).toBeNull();
  });

  it('writes a share message with the score', () => {
    expect(shareMessage(scoreBaseline([{ gameId: 'pairs', summary: round() }]), 'Keen')).toMatch(
      /^My Keen baseline is \d+\. /,
    );
  });
});

describe('plan', () => {
  it('trains the skills the player picked', () => {
    expect(focusSkillsFromAnswers({ focus_skills: ['math', 'words', 'nonsense'] })).toEqual(['math', 'words']);
  });

  it('falls back to the goal, then to every skill', () => {
    expect(focusSkillsFromAnswers({ goal: 'numbers' })).toEqual(['math']);
    expect(focusSkillsFromAnswers({ goal: 'habit' })).toEqual(GAME_SKILLS);
    expect(focusSkillsFromAnswers(null)).toEqual(GAME_SKILLS);
  });

  it('starts on the lowest-scoring focus skill and uses the time answers', () => {
    const baseline = { ...scoreBaseline([]), scores: { memory: 300, math: 500, speed: 200 } };
    const plan = buildPlan({ focus_skills: ['memory', 'math'], minutes: 15, days: 3 }, baseline);
    expect(plan.startSkill).toBe('memory');
    expect(plan.daysPerWeek).toBe(3);
    expect(plan.lines[0]).toBe('3 games a day, about 5 minutes, 3 days a week.');
    expect(plan.lines).toContain('Training memory, math, plus speed in every game.');
    expect(plan.lines).toContain('We’ll start with memory, your lowest score today.');
    expect(plan.lines).toContain('With 15 minutes, play extra rounds from the Games tab after your workout.');
  });

  it('uses the lowest overall score when no focus skill was measured', () => {
    const baseline = { ...scoreBaseline([]), scores: { memory: 300, math: 500, speed: 200 } };
    expect(buildPlan({ focus_skills: ['words'] }, baseline).startSkill).toBe('speed');
  });

  it('works without a baseline', () => {
    const plan = buildPlan(null, null);
    expect(plan.startSkill).toBeNull();
    expect(plan.lines[0]).toBe('3 games a day, about 5 minutes, 5 days a week.');
  });

  it('compares the self-rating with the score where they differ most', () => {
    expect(ratingForScore(650)).toBe('strong');
    expect(ratingForScore(400)).toBe('okay');
    expect(ratingForScore(100)).toBe('weak');
    const scores = { memory: 700, math: 380 };
    expect(selfRatingInsight({ rate_memory: 'weak', rate_math: 'okay' }, scores)).toBe(
      'You undersold your memory: you scored 700. Nice.',
    );
    expect(selfRatingInsight({ rate_math: 'strong' }, { math: 120 })).toMatch(/^Your math scored 120, below/);
    expect(selfRatingInsight({ rate_memory: 'strong' }, { memory: 700 })).toBeNull();
    expect(selfRatingInsight(null, scores)).toBeNull();
  });
});
