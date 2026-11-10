import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ResultsScreen from '../src/app/results';
import { fetchResults, type ResultsData } from '../src/results/api';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, LOG_LEVEL: {} }));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
const mockParams: { date?: string } = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useLocalSearchParams: () => mockParams,
  };
});
const mockClient = {};
jest.mock('@five/shell', () => ({
  ...jest.requireActual('@five/shell'),
  useAuth: () => ({ client: mockClient }),
}));
jest.mock('../src/results/api', () => ({ fetchResults: jest.fn() }));

const mockedFetch = fetchResults as jest.Mock;

const data: ResultsData = {
  slate: { id: 's1', slate_date: '2026-11-10', graded_at: null },
  questions: [
    {
      id: 'q1',
      position: 1,
      sport: 'nba',
      game_label: 'MIL @ NYK',
      prompt: 'Will Jalen Brunson score 27 or more points?',
      points: 10,
      result: 'yes',
      result_value: 31,
      void_reason: null,
      yes_picks: 2,
      no_picks: 18,
    },
    {
      id: 'q2',
      position: 2,
      sport: 'nba',
      game_label: 'BOS @ DEN',
      prompt: 'Will Jamal Murray make 3 or more threes?',
      points: 10,
      result: 'void',
      result_value: null,
      void_reason: 'Jamal Murray did not play',
      yes_picks: 5,
      no_picks: 5,
    },
    {
      id: 'q3',
      position: 3,
      sport: 'nba',
      game_label: 'LAL @ PHX',
      prompt: 'Will Devin Booker score 30 or more points?',
      points: 10,
      result: null,
      result_value: null,
      void_reason: null,
      yes_picks: null,
      no_picks: null,
    },
  ],
  picks: {
    q1: { question_id: 'q1', answer: true, correct: true, base_points: 10, bonus_points: 10 },
    q2: { question_id: 'q2', answer: false, correct: null, base_points: 0, bonus_points: 0 },
    q3: { question_id: 'q3', answer: true, correct: null, base_points: null, bonus_points: null },
  },
  streak: 6,
};

beforeEach(() => {
  mockedFetch.mockReset();
  delete mockParams.date;
});

async function renderScreen() {
  await render(
    <ThemeProvider>
      <ResultsScreen />
    </ThemeProvider>,
  );
}

it('shows points, record, streak and each graded pick', async () => {
  mockedFetch.mockResolvedValue(data);
  await renderScreen();
  expect(await screen.findByText('20 pts')).toBeOnTheScreen();
  expect(screen.getByText('1 of 1 correct · 10 bonus pts')).toBeOnTheScreen();
  expect(screen.getByText('6-day streak')).toBeOnTheScreen();
  expect(screen.getByText('TUESDAY, NOV 10')).toBeOnTheScreen();
  expect(screen.getByLabelText('Question 1, Called it')).toBeOnTheScreen();
  expect(screen.getByText('Only 10% picked Yes')).toBeOnTheScreen();
  expect(screen.getByLabelText('Question 2, Void')).toBeOnTheScreen();
  expect(screen.getByText('Jamal Murray did not play · No points either way')).toBeOnTheScreen();
  expect(screen.getByText('1 still to be graded')).toBeOnTheScreen();
});

it('opens the slate named in the push', async () => {
  mockParams.date = '2026-11-09';
  mockedFetch.mockResolvedValue(data);
  await renderScreen();
  await screen.findByText('20 pts');
  expect(mockedFetch).toHaveBeenCalledWith(mockClient, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), '2026-11-09');
});

it('shows an empty state with no slate', async () => {
  mockedFetch.mockResolvedValue({ slate: null, questions: [], picks: {}, streak: 0 });
  await renderScreen();
  expect(await screen.findByText('No results yet')).toBeOnTheScreen();
});

it('shows a load error', async () => {
  mockedFetch.mockRejectedValue(new Error('offline'));
  await renderScreen();
  expect(await screen.findByText("Couldn't load your results")).toBeOnTheScreen();
});

it('offers to share only once every question is graded', async () => {
  mockedFetch.mockResolvedValue(data);
  await renderScreen();
  await screen.findByText('20 pts');
  expect(screen.queryByText('Share your results')).toBeNull();
});

it('opens the share card for this slate when it is fully graded', async () => {
  const graded: ResultsData = {
    ...data,
    questions: data.questions.map((q) => (q.id === 'q3' ? { ...q, result: 'no', result_value: 22, yes_picks: 9, no_picks: 11 } : q)),
    picks: { ...data.picks, q3: { question_id: 'q3', answer: true, correct: false, base_points: 0, bonus_points: 0 } },
  };
  mockedFetch.mockResolvedValue(graded);
  await renderScreen();
  await fireEvent.press(await screen.findByText('Share your results'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/share-results', params: { date: '2026-11-10' } });
});
