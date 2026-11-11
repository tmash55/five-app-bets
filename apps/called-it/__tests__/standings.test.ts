import {
  accuracy,
  allowanceLine,
  canCreateLeague,
  inviteMessage,
  looksLikeInviteCode,
  normalizeInviteCode,
  ordinal,
  rankLabel,
  recordLabel,
  seasonLabel,
  toStandingRow,
  type StandingRow,
} from '../src/compete/standings';
import { inviteCodeFromPath, savePendingInvite, takePendingInvite } from '../src/invite/pendingInvite';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const row = (user_id: string, rank: number, points = 10): StandingRow => ({
  rank,
  user_id,
  display_name: user_id,
  points,
  correct: 1,
  graded: 2,
  is_me: false,
});

it('reads bigint columns that arrive as strings', () => {
  expect(
    toStandingRow({ rank: '2', user_id: 'u', display_name: 'Ana', points: '25', correct: '3', graded: '4', is_me: true }),
  ).toEqual({ rank: 2, user_id: 'u', display_name: 'Ana', points: 25, correct: 3, graded: 4, is_me: true });
  expect(toStandingRow({ rank: 1, is_owner: false }).is_owner).toBe(false);
});

it('formats records, accuracy and places', () => {
  expect(recordLabel(7, 10)).toBe('7-3');
  expect(recordLabel(0, 0)).toBe('0-0');
  expect(accuracy(2, 3)).toBe(67);
  expect(accuracy(0, 0)).toBeNull();
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th',
  ]);
  const rows = [row('a', 1), row('b', 1), row('c', 3)];
  expect(rankLabel(rows[0], rows)).toBe('T-1st');
  expect(rankLabel(rows[2], rows)).toBe('3rd');
});

it('knows when a free player can create a league', () => {
  const free = { is_pro: false, owned: 0, max_owned: 1, joined: 2, max_joined: null };
  expect(canCreateLeague(free)).toBe(true);
  expect(canCreateLeague({ ...free, owned: 1 })).toBe(false);
  expect(canCreateLeague({ ...free, owned: 1, max_joined: 5 })).toBe(false);
  expect(canCreateLeague({ ...free, owned: 0, joined: 5, max_joined: 5 })).toBe(false);
  expect(canCreateLeague({ ...free, is_pro: true, owned: 9, max_owned: null })).toBe(true);
  expect(allowanceLine(free)).toBe('Free players can create 1 league. Pro removes the limit.');
  expect(allowanceLine({ ...free, max_owned: 3 })).toBe('Free players can create 3 leagues. Pro removes the limit.');
  expect(allowanceLine({ ...free, is_pro: true, max_owned: null })).toBe('Pro: create as many leagues as you like.');
});

it('cleans up typed invite codes', () => {
  expect(normalizeInviteCode(' abcd-2345 ')).toBe('ABCD2345');
  expect(looksLikeInviteCode('abcd-2345')).toBe(true);
  // 0, O, 1, I and L are never used, so a code with them is a typo.
  expect(looksLikeInviteCode('ABCD0345')).toBe(false);
  expect(looksLikeInviteCode('ABC')).toBe(false);
});

it('finds the invite code in a link path', () => {
  expect(inviteCodeFromPath('/join/ABCD2345')).toBe('ABCD2345');
  expect(inviteCodeFromPath('calledit://join/abcd2345')).toBe('ABCD2345');
  expect(inviteCodeFromPath('exp://192.168.1.2:8081/--/join/ABCD2345?x=1')).toBe('ABCD2345');
  expect(inviteCodeFromPath('/results?date=2026-11-10')).toBeNull();
  expect(inviteCodeFromPath('/join/NOTACODE0')).toBeNull();
});

it('writes the share text and season label', () => {
  expect(inviteMessage('Sunday Crew', 'calledit://join/ABCD2345')).toBe(
    'Join my Called It league "Sunday Crew" and see who calls tonight\'s games best: calledit://join/ABCD2345',
  );
  expect(seasonLabel('2026-11-10')).toBe('Season since Nov 10');
});

it('keeps an invite from a signed-out link once, until it is taken', async () => {
  await savePendingInvite('not a code');
  expect(await takePendingInvite()).toBeNull();
  await savePendingInvite('abcd-2345');
  expect(await takePendingInvite()).toBe('ABCD2345');
  expect(await takePendingInvite()).toBeNull();
});
