jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-purchases', () => ({}));

import { MAX_QUESTIONS, MIN_QUESTIONS, validateQuizConfig } from '@five/shell';

import { onboardingQuiz } from '../src/onboarding/quiz';

describe('template onboarding quiz config', () => {
  it('is valid', () => {
    expect(validateQuizConfig(onboardingQuiz)).toEqual([]);
  });

  it('has 8 to 15 questions and uses every question type', () => {
    expect(onboardingQuiz.questions.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    expect(onboardingQuiz.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    const types = new Set(onboardingQuiz.questions.map((q) => q.type));
    expect(types).toEqual(new Set(['single', 'multiple', 'slider']));
  });
});
