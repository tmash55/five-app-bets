import type { QuizConfig } from '@five/shell';

/**
 * This app's onboarding quiz. Edit this file to change the quiz; the screens
 * come from @five/shell and need no changes. 8 to 15 questions; types are
 * "single", "multiple" and "slider". See packages/shell/src/onboarding/types.ts.
 */
export const onboardingQuiz = {
  id: 'template-onboarding',
  version: 1,
  intro: {
    title: 'Let’s set things up for you',
    body: 'Answer a few quick questions and we’ll tailor the app to how you like to play.',
    ctaLabel: 'Get started',
  },
  questions: [
    {
      id: 'goal',
      type: 'single',
      title: 'What brings you here?',
      options: [
        { id: 'fun', label: 'Just for fun' },
        { id: 'improve', label: 'Get better at something' },
        { id: 'compete', label: 'Compete with friends' },
        { id: 'routine', label: 'Build a daily habit' },
      ],
    },
    {
      id: 'interests',
      type: 'multiple',
      title: 'Which topics do you like?',
      options: [
        { id: 'sports', label: 'Sports' },
        { id: 'movies', label: 'Movies and TV' },
        { id: 'music', label: 'Music' },
        { id: 'science', label: 'Science' },
        { id: 'history', label: 'History' },
      ],
    },
    {
      id: 'minutes',
      type: 'slider',
      title: 'How many minutes a day do you want to spend?',
      min: 5,
      max: 60,
      step: 5,
      defaultValue: 15,
      unit: 'min',
      minLabel: 'A quick break',
      maxLabel: 'Deep dive',
    },
    {
      id: 'time_of_day',
      type: 'single',
      title: 'When do you usually have a moment?',
      options: [
        { id: 'morning', label: 'Morning' },
        { id: 'lunch', label: 'Around lunch' },
        { id: 'evening', label: 'Evening' },
        { id: 'varies', label: 'It varies' },
      ],
    },
    {
      id: 'experience',
      type: 'single',
      title: 'How would you rate yourself today?',
      options: [
        { id: 'new', label: 'Brand new', description: 'Start me with the basics.' },
        { id: 'some', label: 'I know a bit' },
        { id: 'expert', label: 'Bring the hard stuff' },
      ],
    },
    {
      id: 'motivators',
      type: 'multiple',
      title: 'What keeps you coming back?',
      maxSelections: 2,
      options: [
        { id: 'streaks', label: 'Keeping a streak' },
        { id: 'leaderboards', label: 'Leaderboards' },
        { id: 'progress', label: 'Seeing my progress' },
        { id: 'reminders', label: 'A friendly reminder' },
      ],
    },
    {
      id: 'confidence',
      type: 'slider',
      title: 'How sure are you that you’ll stick with it?',
      min: 1,
      max: 10,
      defaultValue: 7,
      minLabel: 'Not sure',
      maxLabel: 'Very sure',
    },
    {
      id: 'reminders',
      type: 'single',
      title: 'Want a daily reminder?',
      options: [
        { id: 'yes', label: 'Yes, remind me' },
        { id: 'no', label: 'No thanks' },
      ],
    },
  ],
  result: {
    title: 'Your plan is ready',
    body: 'We’ll keep sessions to about {{minutes}} a day, focused on {{interests}}.',
    variants: [
      {
        when: [{ question: 'goal', equals: 'compete' }],
        title: 'You’re built to compete',
        body: 'About {{minutes}} a day on {{interests}}, with leaderboards to chase.',
      },
      {
        when: [{ question: 'minutes', lte: 10 }],
        title: 'Small daily wins',
        body: 'Quick {{minutes}} sessions on {{interests}}. Easy to fit in.',
      },
    ],
    highlights: [
      { label: 'Daily time', question: 'minutes' },
      { label: 'Topics', question: 'interests' },
      { label: 'Best time', question: 'time_of_day' },
    ],
    ctaLabel: 'Continue',
  },
} satisfies QuizConfig;
