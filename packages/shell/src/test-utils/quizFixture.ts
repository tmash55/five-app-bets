import type { QuizConfig, QuizQuestion } from '../onboarding/types';

const filler = (n: number): QuizQuestion => ({
  id: `q${n}`,
  type: 'single',
  title: `Filler ${n}`,
  options: [
    { id: 'a', label: `A${n}` },
    { id: 'b', label: `B${n}` },
  ],
});

export function makeQuiz(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    id: 'test-quiz',
    version: 2,
    intro: { title: 'Welcome', body: 'A few questions.' },
    questions: [
      {
        id: 'goal',
        type: 'single',
        title: 'What is your goal?',
        options: [
          { id: 'fun', label: 'Have fun' },
          { id: 'win', label: 'Win' },
        ],
      },
      {
        id: 'topics',
        type: 'multiple',
        title: 'Pick topics',
        maxSelections: 2,
        options: [
          { id: 'nfl', label: 'NFL' },
          { id: 'nba', label: 'NBA' },
          { id: 'mlb', label: 'MLB' },
        ],
      },
      {
        id: 'minutes',
        type: 'slider',
        title: 'Minutes a day',
        min: 5,
        max: 30,
        step: 5,
        defaultValue: 10,
        unit: 'min',
      },
      filler(4),
      filler(5),
      filler(6),
      filler(7),
      filler(8),
    ],
    result: {
      title: 'Plan for {{goal}}',
      body: '{{minutes}} on {{topics}}.',
      variants: [{ when: [{ question: 'goal', equals: 'win' }], title: 'Built to win' }],
      highlights: [{ label: 'Topics', question: 'topics' }],
      ctaLabel: 'See plans',
    },
    ...overrides,
  };
}
