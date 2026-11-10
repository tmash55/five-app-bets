import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Share from 'react-native-share';
import { captureRef } from 'react-native-view-shot';

import ShareResultsScreen from '../src/app/share-results';
import * as competeApi from '../src/compete/api';
import type { LeagueSummary } from '../src/compete/standings';
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
jest.mock('expo-linking', () => ({ createURL: (path: string) => `calledit://${path.replace(/^\//, '')}` }));
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
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn(), shareSingle: jest.fn(), isPackageInstalled: jest.fn() },
  Social: { Sms: 'sms', InstagramStories: 'instagramstories' },
}));
const mockClient = {};
jest.mock('@five/shell', () => ({
  ...jest.requireActual('@five/shell'),
  useAuth: () => ({ client: mockClient }),
}));
jest.mock('../src/results/api', () => ({ fetchResults: jest.fn() }));
jest.mock('../src/compete/api', () => ({
  ...jest.requireActual('../src/compete/api'),
  fetchMyLeagues: jest.fn(),
  fetchDisplayName: jest.fn(),
  createLeague: jest.fn(),
}));

const m = competeApi as jest.Mocked<typeof competeApi>;
const mockedFetch = fetchResults as jest.Mock;
const share = Share as jest.Mocked<typeof Share>;

const graded: ResultsData = {
  slate: { id: 's1', slate_date: '2026-11-10', graded_at: '2026-11-11T04:00:00Z' },
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
      game_label: 'LAL @ PHX',
      prompt: 'Will Devin Booker score 30 or more points?',
      points: 10,
      result: 'no',
      result_value: 22,
      void_reason: null,
      yes_picks: 9,
      no_picks: 11,
    },
  ],
  picks: {
    q1: { question_id: 'q1', answer: true, correct: true, base_points: 10, bonus_points: 10 },
    q2: { question_id: 'q2', answer: true, correct: false, base_points: 0, bonus_points: 0 },
  },
  streak: 4,
};

const crew: LeagueSummary = {
  id: 'l1',
  name: 'Sunday Crew',
  invite_code: 'ABCD2345',
  season_start: '2026-11-01',
  member_count: 4,
  is_owner: true,
  my_rank: 1,
  my_points: 80,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.date;
  mockedFetch.mockResolvedValue(graded);
  m.fetchDisplayName.mockResolvedValue('Ana');
  m.fetchMyLeagues.mockResolvedValue([crew]);
  (captureRef as jest.Mock).mockResolvedValue('file:///tmp/card.png');
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

/** Waits for the share button to come back from its loading state, so no update lands after the test. */
async function settled(title: string) {
  await waitFor(() => expect(screen.getByText(title)).toBeOnTheScreen());
}

async function renderScreen() {
  await render(
    <ThemeProvider>
      <ShareResultsScreen />
    </ThemeProvider>,
  );
}

it('shows the card: record, best call, streak and the league invite', async () => {
  await renderScreen();
  expect(await screen.findByLabelText('Results card: Called 1 of 2, 1-1, 20 points')).toBeOnTheScreen();
  expect(screen.getByText('Ana went')).toBeOnTheScreen();
  expect(screen.getByText('20 pts · 10 bonus · 4-day streak')).toBeOnTheScreen();
  expect(screen.getByText('Will Jalen Brunson score 27 or more points?')).toBeOnTheScreen();
  expect(screen.getByText('Only 10% picked Yes')).toBeOnTheScreen();
  expect(screen.getByText('Beat me in "Sunday Crew"')).toBeOnTheScreen();
  expect(screen.getByText('calledit://join/ABCD2345')).toBeOnTheScreen();
  expect(screen.getByText('Your link invites friends to Sunday Crew.')).toBeOnTheScreen();
});

it('sends the card image and invite link to Messages', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByText('Messages'));
  await waitFor(() => expect(share.shareSingle).toHaveBeenCalled());
  expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 1080, height: 1920, format: 'png' }));
  expect(share.shareSingle).toHaveBeenCalledWith({
    social: 'sms',
    url: 'file:///tmp/card.png',
    type: 'image/png',
    message: 'I went 1-1 on Called It (20 pts). Join my league "Sunday Crew" and try to beat me: calledit://join/ABCD2345',
  });
  await settled('Messages');
});

it('opens the X composer with the invite link', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByText('X'));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  const url = (Linking.openURL as jest.Mock).mock.calls[0][0] as string;
  expect(url).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/);
  expect(url).toContain(`&url=${encodeURIComponent('calledit://join/ABCD2345')}`);
  await settled('X');
});

it('hides Instagram Stories until a Meta app ID is set', async () => {
  await renderScreen();
  await screen.findByText('Messages');
  expect(screen.queryByText('Instagram Stories')).toBeNull();
});

it('lets the player pick which league the link invites to', async () => {
  m.fetchMyLeagues.mockResolvedValue([crew, { ...crew, id: 'l2', name: 'Office', invite_code: 'WXYZ6789', is_owner: false }]);
  await renderScreen();
  expect(await screen.findByText('calledit://join/ABCD2345')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Office'));
  expect(await screen.findByText('calledit://join/WXYZ6789')).toBeOnTheScreen();
});

it('starts a league on first share when the player has none', async () => {
  m.fetchMyLeagues.mockResolvedValueOnce([]).mockResolvedValue([{ ...crew, name: "Ana's League", member_count: 1 }]);
  m.createLeague.mockResolvedValue({ id: 'l1', invite_code: 'ABCD2345' });
  await renderScreen();
  expect(await screen.findByText('Sharing starts your league, so friends who open the link join you there.')).toBeOnTheScreen();
  expect(screen.getByDisplayValue("Ana's League")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('More options'));
  await waitFor(() => expect(share.open).toHaveBeenCalled());
  expect(m.createLeague).toHaveBeenCalledWith(mockClient, "Ana's League");
  expect(share.open).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'file:///tmp/card.png', message: expect.stringContaining('calledit://join/ABCD2345') }),
  );
  await settled('More options');
});

it('treats backing out of the share sheet as no error', async () => {
  share.shareSingle.mockRejectedValue(new Error('User did not share'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Messages'));
  await waitFor(() => expect(share.shareSingle).toHaveBeenCalled());
  await settled('Messages');
  expect(screen.queryByText("Couldn't share")).toBeNull();
});

it('refuses a slate that is not fully graded', async () => {
  mockedFetch.mockResolvedValue({
    ...graded,
    questions: graded.questions.map((q) => (q.id === 'q2' ? { ...q, result: null } : q)),
  });
  await renderScreen();
  expect(await screen.findByText('Nothing to share yet')).toBeOnTheScreen();
});
