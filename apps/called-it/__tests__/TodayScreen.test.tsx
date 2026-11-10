import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import TodayScreen from '../src/app/(tabs)/index';
import { fetchToday, makePick, PickLockedError, type TodayData } from '../src/today/api';

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
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return { router: { push: jest.fn() }, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
const mockClient = {};
jest.mock('@five/shell', () => ({
  ...jest.requireActual('@five/shell'),
  useAuth: () => ({ client: mockClient }),
}));
jest.mock('../src/slate/useIsAdmin', () => ({ useIsAdmin: () => false }));
jest.mock('../src/today/api', () => ({
  ...jest.requireActual('../src/today/api'),
  fetchToday: jest.fn(),
  makePick: jest.fn(),
}));

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const question = (id: string, lock_at: string) => ({
  id,
  position: Number(id.slice(1)),
  sport: 'nba' as const,
  game_label: 'MIL @ NYK',
  starts_at: lock_at,
  lock_at,
  prompt: `Question ${id} will go over?`,
  points: 10,
});

function today(overrides: Partial<TodayData> = {}): TodayData {
  return {
    slate: { id: 's1', slate_date: '2026-11-10' },
    questions: [question('q1', inHours(2)), question('q2', inHours(3)), question('q3', inHours(-1))],
    picks: {},
    clockOffsetMs: 0,
    ...overrides,
  };
}

const mockedFetch = fetchToday as jest.Mock;
const mockedPick = makePick as jest.Mock;

async function renderScreen() {
  await render(
    <ThemeProvider>
      <TodayScreen />
    </ThemeProvider>,
  );
}

function card(position: number) {
  return screen.getByLabelText(new RegExp(`^Question ${position}`));
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedPick.mockReset();
});

it('shows an empty state when there is no slate', async () => {
  mockedFetch.mockResolvedValue(today({ slate: null, questions: [] }));
  await renderScreen();
  expect(await screen.findByText('No questions today')).toBeOnTheScreen();
});

it('lets a player answer every open question and change a pick', async () => {
  mockedFetch.mockResolvedValue(today());
  mockedPick.mockResolvedValue(undefined);
  await renderScreen();

  expect(await screen.findByText('0 of 3 picked')).toBeOnTheScreen();
  expect(screen.getByText(/^3 questions · Next lock in (1h 59m|2h 0m)$/)).toBeOnTheScreen();
  expect(screen.getAllByText('+10 PTS')).toHaveLength(3);

  const yes1 = screen.getAllByRole('button', { name: 'Yes' })[0];
  await fireEvent.press(yes1);
  await waitFor(() => expect(screen.getByText('1 of 3 picked')).toBeOnTheScreen());
  expect(mockedPick).toHaveBeenLastCalledWith({}, 'q1', true);

  await fireEvent.press(screen.getAllByRole('button', { name: 'No' })[1]);
  await waitFor(() => expect(screen.getByText('2 of 3 picked')).toBeOnTheScreen());

  // Change q1 from Yes to No.
  await fireEvent.press(screen.getAllByRole('button', { name: 'No' })[0]);
  await waitFor(() => expect(mockedPick).toHaveBeenLastCalledWith({}, 'q1', false));
  expect(screen.getByText('2 of 3 picked')).toBeOnTheScreen();
});

it('does not let a player pick on a question whose game has started', async () => {
  mockedFetch.mockResolvedValue(today());
  await renderScreen();
  await screen.findByText('0 of 3 picked');
  expect(card(3)).toHaveAccessibleName('Question 3, locked');
  expect(screen.getByText('Locked · No pick')).toBeOnTheScreen();
  const lockedYes = screen.getAllByRole('button', { name: 'Yes' })[2];
  expect(lockedYes).toBeDisabled();
  await fireEvent.press(lockedYes);
  expect(mockedPick).not.toHaveBeenCalled();
});

it('undoes the pick and locks the card when the server says the game started', async () => {
  mockedFetch.mockResolvedValue(today({ picks: { q1: true } }));
  mockedPick.mockRejectedValue(new PickLockedError());
  await renderScreen();
  await screen.findByText('1 of 3 picked');

  await fireEvent.press(screen.getAllByRole('button', { name: 'No' })[0]);
  expect(await screen.findByText('Pick not saved')).toBeOnTheScreen();
  expect(screen.getByText('Locked · You picked Yes')).toBeOnTheScreen();
  expect(card(1)).toHaveAccessibleName('Question 1, locked');
});
