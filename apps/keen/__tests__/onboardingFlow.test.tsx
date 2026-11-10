import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnalyticsProvider, OnboardingProvider, onboardingStorageKey, type QuizAnswers } from '@five/shell';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import type { ReactNode } from 'react';
import { captureRef } from 'react-native-view-shot';

import OnboardingQuizRoute from '@/app/(onboarding)/index';
import PaywallPlaceholder from '@/app/(onboarding)/paywall';
import PlanRoute from '@/app/(onboarding)/plan';
import { readBaseline, type BaselineResult } from '@/baseline/baseline';
import { BASELINE_EVENTS, BaselineTest } from '@/baseline/BaselineTest';
import { onboardingQuiz } from '@/onboarding/quiz';
import { readFocusSkills } from '@/skills/focusSkills';
import { readSkillHistory } from '@/skills/history';

import { advance, renderThemed } from '../test/helpers';

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
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///tmp/card.png') }));

// The quiz screens are covered by the shell's tests; here a stand-in finishes the quiz.
const mockAnswers: QuizAnswers = {
  goal: 'memory',
  focus_skills: ['memory', 'words'],
  minutes: 10,
  days: 4,
  rate_memory: 'strong',
  rate_math: 'okay',
};
jest.mock('@five/shell', () => {
  const actual = jest.requireActual('@five/shell');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    ...actual,
    OnboardingQuiz: ({ onComplete }: { onComplete: (answers: QuizAnswers) => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Finish quiz" onPress={() => onComplete(mockAnswers)}>
        <Text>Quiz</Text>
      </Pressable>
    ),
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));

const track = jest.fn();
const quizKey = onboardingStorageKey(onboardingQuiz.id);

function inOnboarding(node: ReactNode) {
  return renderThemed(
    <AnalyticsProvider track={track}>
      <OnboardingProvider quizId={onboardingQuiz.id}>{node}</OnboardingProvider>
    </AnalyticsProvider>,
  );
}

async function waitForStorage(check: () => Promise<boolean>) {
  for (let i = 0; i < 50 && !(await check()); i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  expect(await check()).toBe(true);
}

beforeEach(async () => {
  jest.useRealTimers();
  mockPush.mockClear();
  mockReplace.mockClear();
  track.mockClear();
  await AsyncStorage.clear();
});

it('saves the quiz answers and focus skills, then starts the baseline test', async () => {
  const view = await inOnboarding(<OnboardingQuizRoute />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish quiz' }));
  expect(mockPush).toHaveBeenCalledWith('/baseline');
  await waitForStorage(async () => (await AsyncStorage.getItem('keen.focusSkills')) !== null);
  expect(await readFocusSkills()).toEqual(['memory', 'words']);
  await waitForStorage(async () => (await AsyncStorage.getItem(quizKey)) !== null);
  expect(JSON.parse((await AsyncStorage.getItem(quizKey))!).answers).toEqual(mockAnswers);
  await view.unmount();
});

it('runs two 30-second games, then saves the baseline as the starting scores', async () => {
  jest.useFakeTimers();
  const onDone = jest.fn();
  const view = await inOnboarding(<BaselineTest onDone={onDone} />);

  expect(await screen.findByText('Pairs')).toBeOnTheScreen();
  expect(screen.getByText(/game 1 of 2 · 30 seconds/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Start the test' }));
  expect(track).toHaveBeenCalledWith(BASELINE_EVENTS.started, { game_count: 2 });

  // 3-second countdown, then the 30-second round. Nobody taps, so grids time out.
  await advance(3_000);
  await advance(29_000);
  expect(screen.queryByText(/game 2 of 2/)).toBeNull();
  await advance(1_500);

  expect(await screen.findByText('Quick Sum')).toBeOnTheScreen();
  expect(screen.getByText(/game 2 of 2 · 30 seconds/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Start Quick Sum' }));
  await advance(3_000);
  await advance(31_000);

  jest.useRealTimers();
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  const result: BaselineResult = onDone.mock.calls[0][0];
  expect(result.rounds.map((r) => r.gameId)).toEqual(['pairs', 'quick-sum']);
  expect(track).toHaveBeenCalledWith(BASELINE_EVENTS.gameFinished, expect.objectContaining({ game_id: 'pairs' }));
  expect(track).toHaveBeenCalledWith(
    BASELINE_EVENTS.completed,
    expect.objectContaining({ keen_score: result.keenScore }),
  );
  expect(await readBaseline()).toEqual(result);
  expect((await readSkillHistory()).at(-1)?.scores).toEqual(expect.objectContaining(result.scores));
  await view.unmount();
});

const baseline: BaselineResult = {
  date: '2026-11-10',
  scores: { memory: 420, math: 610, speed: 380 },
  keenScore: 470,
  rounds: [],
};

it('shows starting scores, a share card and the plan, then goes to the paywall', async () => {
  await AsyncStorage.setItem('keen.baseline', JSON.stringify(baseline));
  await AsyncStorage.setItem(quizKey, JSON.stringify({ answers: mockAnswers, completedAt: null }));

  const view = await inOnboarding(<PlanRoute />);
  expect(await screen.findByText('Your plan is ready')).toBeOnTheScreen();
  expect(screen.getByLabelText('My Keen baseline: 470 out of 1000')).toBeOnTheScreen();
  expect(screen.getByText('610')).toBeOnTheScreen();
  await waitFor(() => expect(screen.getByText('We’ll start with memory, your lowest score today.')).toBeOnTheScreen());
  expect(screen.getByText('3 games a day, about 5 minutes, 4 days a week.')).toBeOnTheScreen();
  expect(screen.getByText('Words gets a score in your first workout.')).toBeOnTheScreen();
  expect(screen.getByText(/below what you expected/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Share my score' }));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/card.png', expect.anything()));
  expect(captureRef).toHaveBeenCalled();
  await waitFor(() => expect(track).toHaveBeenCalledWith('baseline_shared', { method: 'image', keen_score: 470 }));

  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/paywall');
  await view.unmount();
});

it('still shows the plan when the baseline was not saved', async () => {
  const view = await inOnboarding(<PlanRoute />);
  expect(await screen.findByText('Your plan is ready')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Share my score' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen();
  await view.unmount();
});

it('the paywall placeholder finishes onboarding', async () => {
  const view = await inOnboarding(<PaywallPlaceholder />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
  await waitForStorage(async () => Boolean(JSON.parse((await AsyncStorage.getItem(quizKey)) ?? '{}').completedAt));
  await view.unmount();
});
