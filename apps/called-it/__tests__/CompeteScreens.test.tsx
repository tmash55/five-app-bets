import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import LeaderboardScreen from '../src/app/(tabs)/leaderboard';
import LeaguesScreen from '../src/app/(tabs)/leagues';
import ProfileScreen from '../src/app/(tabs)/profile';
import JoinScreen from '../src/app/join/[code]';
import LeagueScreen from '../src/app/league/[id]';
import * as api from '../src/compete/api';
import { fetchProfile } from '../src/profile/api';

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
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Stack: { Screen: () => null },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useLocalSearchParams: () => mockParams,
  };
});
const mockClient = {};
jest.mock('@five/shell', () => ({
  ...jest.requireActual('@five/shell'),
  useAuth: () => ({ client: mockClient, session: { user: { email: 'ana@example.com' } } }),
}));
jest.mock('../src/compete/api', () => ({
  ...jest.requireActual('../src/compete/api'),
  fetchLeaderboard: jest.fn(),
  fetchDisplayName: jest.fn(),
  fetchMyLeagues: jest.fn(),
  fetchAllowance: jest.fn(),
  createLeague: jest.fn(),
  previewLeague: jest.fn(),
  joinLeague: jest.fn(),
  fetchLeague: jest.fn(),
  setDisplayName: jest.fn(),
}));
jest.mock('../src/profile/api', () => ({ fetchProfile: jest.fn() }));

const m = api as jest.Mocked<typeof api>;
const free = { is_pro: false, owned: 0, max_owned: 1, joined: 0, max_joined: null };

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  m.fetchDisplayName.mockResolvedValue('Ana');
});

describe('Leaderboard', () => {
  it('shows ranked players with your row marked, and the week by default', async () => {
    m.fetchLeaderboard.mockResolvedValue([
      { rank: 1, user_id: 'b', display_name: 'Ben', points: 30, correct: 3, graded: 4, is_me: false },
      { rank: 2, user_id: 'a', display_name: 'Ana', points: 20, correct: 2, graded: 4, is_me: true },
    ]);
    await wrap(<LeaderboardScreen />);
    expect(await screen.findByLabelText('1st, Ben, 30 points')).toBeOnTheScreen();
    expect(screen.getByText('Ana (you)')).toBeOnTheScreen();
    expect(screen.getByText('2-2')).toBeOnTheScreen();
    expect(m.fetchLeaderboard).toHaveBeenLastCalledWith(mockClient, 'global', 'week', expect.any(String));
  });

  it('switches to friends, all time, and points you to Leagues when you have none', async () => {
    m.fetchLeaderboard.mockResolvedValue([
      { rank: 1, user_id: 'a', display_name: 'Ana', points: 0, correct: 0, graded: 0, is_me: true },
    ]);
    await wrap(<LeaderboardScreen />);
    await screen.findByText('Ana (you)');
    await fireEvent.press(screen.getByText('Friends'));
    await fireEvent.press(screen.getByText('All time'));
    expect(m.fetchLeaderboard).toHaveBeenLastCalledWith(mockClient, 'friends', 'all', expect.any(String));
    expect(await screen.findByText(/Friends are the people in your leagues/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Go to Leagues'));
    expect(router.push).toHaveBeenCalledWith('/leagues');
  });

  it('marks the gap before your row when you are outside the top', async () => {
    m.fetchLeaderboard.mockResolvedValue([
      { rank: 1, user_id: 'b', display_name: 'Ben', points: 30, correct: 3, graded: 4, is_me: false },
      { rank: 57, user_id: 'a', display_name: 'Ana', points: 0, correct: 0, graded: 0, is_me: true },
    ]);
    await wrap(<LeaderboardScreen />);
    expect(await screen.findByText('···')).toBeOnTheScreen();
    expect(screen.getByLabelText('57th, Ana (you), 0 points')).toBeOnTheScreen();
  });

  it('asks for a display name when there is none', async () => {
    m.fetchDisplayName.mockResolvedValue(null);
    m.fetchLeaderboard.mockResolvedValue([]);
    await wrap(<LeaderboardScreen />);
    expect(await screen.findByText('Pick a display name')).toBeOnTheScreen();
  });
});

describe('Leagues', () => {
  it('lists leagues with your place and creates a new one', async () => {
    m.fetchMyLeagues.mockResolvedValue([
      { id: 'l1', name: 'Sunday Crew', invite_code: 'ABCD2345', season_start: '2026-11-10', member_count: 4, is_owner: false, my_rank: 2, my_points: 40 },
    ]);
    m.fetchAllowance.mockResolvedValue(free);
    m.createLeague.mockResolvedValue({ id: 'new', invite_code: 'WXYZ2345' });
    await wrap(<LeaguesScreen />);
    expect(await screen.findByText("4 players · You're 2nd · 40 pts")).toBeOnTheScreen();
    expect(screen.getByText('Free players can create 1 league. Pro removes the limit.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('League name'), 'Office Pool');
    await fireEvent.press(screen.getByText('Create league'));
    expect(m.createLeague).toHaveBeenCalledWith(mockClient, 'Office Pool');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/league/[id]', params: { id: 'new' } });
  });

  it('shows the limit instead of the form once a free player owns a league', async () => {
    m.fetchMyLeagues.mockResolvedValue([]);
    m.fetchAllowance.mockResolvedValue({ ...free, owned: 1, joined: 1 });
    await wrap(<LeaguesScreen />);
    expect(await screen.findByText('League limit reached')).toBeOnTheScreen();
    expect(screen.queryByText('Create league')).toBeNull();
  });

  it('opens the join screen for a typed code', async () => {
    m.fetchMyLeagues.mockResolvedValue([]);
    m.fetchAllowance.mockResolvedValue(free);
    await wrap(<LeaguesScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Invite code'), 'abcd-2345');
    await fireEvent.press(screen.getByText('Find league'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/join/[code]', params: { code: 'ABCD2345' } });
  });
});

describe('Join and league table', () => {
  it('previews the league from the link and joins it', async () => {
    mockParams.code = 'ABCD2345';
    m.previewLeague.mockResolvedValue({ id: 'l1', name: 'Sunday Crew', member_count: 1, is_member: false });
    m.joinLeague.mockResolvedValue('l1');
    await wrap(<JoinScreen />);
    expect(await screen.findByText('Sunday Crew')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Join league'));
    expect(m.joinLeague).toHaveBeenCalledWith(mockClient, 'ABCD2345');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/league/[id]', params: { id: 'l1' } });
  });

  it('says when an invite is not valid', async () => {
    mockParams.code = 'ZZZZZZZZ';
    m.previewLeague.mockRejectedValue(new api.InviteNotFoundError());
    await wrap(<JoinScreen />);
    expect(await screen.findByText('Invite not found')).toBeOnTheScreen();
  });

  it('shows both players ranked in the league table', async () => {
    mockParams.id = 'l1';
    m.fetchLeague.mockResolvedValue({
      league: { id: 'l1', name: 'Sunday Crew', invite_code: 'ABCD2345', season_start: '2026-11-10', member_count: 2, is_owner: true, my_rank: 1, my_points: 10 },
      table: [
        { rank: 1, user_id: 'a', display_name: 'Ana', points: 10, correct: 1, graded: 2, is_me: true, is_owner: true },
        { rank: 1, user_id: 'b', display_name: 'Ben', points: 10, correct: 1, graded: 2, is_me: false, is_owner: false },
      ],
    });
    await wrap(<LeagueScreen />);
    expect(await screen.findByLabelText('T-1st, Ana (you), 10 points')).toBeOnTheScreen();
    expect(screen.getByLabelText('T-1st, Ben, 10 points')).toBeOnTheScreen();
    expect(screen.getByText('1-1 · Owner')).toBeOnTheScreen();
    expect(screen.getByText('Season since Nov 10 · 2 players')).toBeOnTheScreen();
    expect(screen.getByText('Or share the code ABCD2345')).toBeOnTheScreen();
    expect(screen.getByText('Rename league')).toBeOnTheScreen();
  });
});

describe('Profile', () => {
  it('shows record, accuracy by sport and badges', async () => {
    (fetchProfile as jest.Mock).mockResolvedValue({
      streak: 3,
      stats: {
        by_sport: [
          { sport: 'nba', graded: 10, correct: 7, voided: 0, points: 80, bonus_picks: 1 },
          { sport: 'nfl', graded: 4, correct: 1, voided: 1, points: 10, bonus_picks: 0 },
        ],
        slates_played: 5,
        best_streak: 4,
        perfect_slates: 0,
        leagues_owned: 1,
        leagues_joined: 1,
      },
    });
    await wrap(<ProfileScreen />);
    expect(await screen.findByText('8-6')).toBeOnTheScreen();
    expect(screen.getByText('90')).toBeOnTheScreen();
    expect(screen.getByLabelText('NBA 70% · 7 of 10')).toBeOnTheScreen();
    expect(screen.getByLabelText('NFL 25% · 1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('3-day streak · best 4 · 5 slates played')).toBeOnTheScreen();
    expect(screen.getByText('Badges · 4 of 8')).toBeOnTheScreen();
    expect(screen.getByLabelText('Commissioner, earned')).toBeOnTheScreen();
    expect(screen.getByLabelText('Perfect night, not earned yet. Get every pick right on a slate (at least 3 graded).')).toBeOnTheScreen();
  });

  it('asks for a display name first and saves it', async () => {
    m.fetchDisplayName.mockResolvedValue(null);
    m.setDisplayName.mockResolvedValue('Ana B');
    (fetchProfile as jest.Mock).mockResolvedValue({
      streak: 0,
      stats: { by_sport: [], slates_played: 0, best_streak: 0, perfect_slates: 0, leagues_owned: 0, leagues_joined: 0 },
    });
    await wrap(<ProfileScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Display name'), 'Ana B');
    await fireEvent.press(screen.getByText('Save name'));
    expect(m.setDisplayName).toHaveBeenCalledWith(mockClient, 'Ana B');
    expect(await screen.findByText('Change display name')).toBeOnTheScreen();
  });
});
