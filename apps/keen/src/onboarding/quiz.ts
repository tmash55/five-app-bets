import type { QuizConfig } from '@five/shell';

/**
 * Keen's onboarding quiz: goals, time available and self-rated strengths. The
 * screens come from @five/shell. Its result screen hands off to the 60-second
 * baseline test, then the plan, then the paywall.
 *
 * Question ids used elsewhere (src/onboarding/plan.ts): `focus_skills`,
 * `minutes`, `days`, `goal` and `rate_<skill>`. Bump `version` when questions change.
 */
const RATING_OPTIONS = [
  { id: 'strong', label: 'It’s a strength' },
  { id: 'okay', label: 'About average' },
  { id: 'weak', label: 'Could be better' },
];

export const onboardingQuiz = {
  id: 'keen-onboarding',
  version: 1,
  intro: {
    title: 'Train a sharper mind in five minutes a day',
    body: 'Answer twelve quick questions, then take a 60-second test to find your starting scores.',
    ctaLabel: 'Get started',
  },
  questions: [
    {
      id: 'goal',
      type: 'single',
      title: 'What’s your main goal?',
      options: [
        { id: 'memory', label: 'Remember more' },
        { id: 'numbers', label: 'Get quicker with numbers' },
        { id: 'focus', label: 'Focus for longer' },
        { id: 'sharp', label: 'Stay sharp as I get older' },
        { id: 'habit', label: 'A healthy daily habit' },
      ],
    },
    {
      id: 'focus_skills',
      type: 'multiple',
      title: 'Which skills do you want to train?',
      subtitle: 'Your daily workout picks games for these. You can pick up to three.',
      maxSelections: 3,
      options: [
        { id: 'memory', label: 'Memory', description: 'Pairs, Sequence' },
        { id: 'math', label: 'Math', description: 'Quick Sum, Price Check' },
        { id: 'focus', label: 'Focus', description: 'Odd One Out' },
        { id: 'words', label: 'Words', description: 'Missing Letter' },
      ],
    },
    {
      id: 'minutes',
      type: 'slider',
      title: 'How much time can you give it each day?',
      min: 3,
      max: 20,
      defaultValue: 5,
      unit: 'min',
      minLabel: 'A quick break',
      maxLabel: 'A proper session',
    },
    {
      id: 'days',
      type: 'slider',
      title: 'How many days a week?',
      min: 1,
      max: 7,
      defaultValue: 5,
      unit: 'days',
      minLabel: 'Now and then',
      maxLabel: 'Every day',
    },
    {
      id: 'time_of_day',
      type: 'single',
      title: 'When are you sharpest?',
      options: [
        { id: 'morning', label: 'Morning' },
        { id: 'midday', label: 'Midday' },
        { id: 'evening', label: 'Evening' },
        { id: 'varies', label: 'It varies' },
      ],
    },
    {
      id: 'rate_memory',
      type: 'single',
      title: 'How’s your memory?',
      subtitle: 'Names, lists, where you left your keys.',
      options: RATING_OPTIONS,
    },
    {
      id: 'rate_math',
      type: 'single',
      title: 'How are you with numbers in your head?',
      subtitle: 'Splitting a bill, adding up a basket.',
      options: RATING_OPTIONS,
    },
    {
      id: 'rate_focus',
      type: 'single',
      title: 'How well do you spot details?',
      subtitle: 'The typo, the odd one out, the thing that changed.',
      options: RATING_OPTIONS,
    },
    {
      id: 'rate_words',
      type: 'single',
      title: 'How’s your way with words?',
      subtitle: 'Spelling, crosswords, finding the right word.',
      options: RATING_OPTIONS,
    },
    {
      id: 'rate_speed',
      type: 'single',
      title: 'How quick do you think on your feet?',
      options: RATING_OPTIONS,
    },
    {
      id: 'experience',
      type: 'single',
      title: 'Have you played brain games before?',
      options: [
        { id: 'never', label: 'Never' },
        { id: 'sometimes', label: 'Now and then' },
        { id: 'daily', label: 'Most days' },
      ],
    },
    {
      id: 'motivators',
      type: 'multiple',
      title: 'What keeps you coming back?',
      maxSelections: 2,
      options: [
        { id: 'progress', label: 'Watching my scores climb' },
        { id: 'streaks', label: 'Keeping a streak' },
        { id: 'challenge', label: 'A tough challenge' },
        { id: 'routine', label: 'A calm daily routine' },
      ],
    },
  ],
  result: {
    title: 'One last step: your baseline',
    body: 'Two quick games, 30 seconds each, measure your memory, math and speed. Your plan starts from there.',
    variants: [
      {
        when: [{ question: 'goal', equals: 'sharp' }],
        body: 'Staying sharp starts with knowing where you are. Two quick games, 30 seconds each, measure your memory, math and speed.',
      },
    ],
    highlights: [
      { label: 'Training', question: 'focus_skills' },
      { label: 'Each day', question: 'minutes' },
      { label: 'Each week', question: 'days' },
    ],
    ctaLabel: 'Start the 60-second test',
  },
} satisfies QuizConfig;
