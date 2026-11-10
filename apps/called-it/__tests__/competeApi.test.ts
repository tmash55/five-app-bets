import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createLeague,
  fetchLeaderboard,
  fetchMyLeagues,
  InviteNotFoundError,
  joinLeague,
  LeagueLimitError,
} from '../src/compete/api';

function clientWith(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const rpc = jest.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

it('asks for the leaderboard and converts the rows', async () => {
  const { client, rpc } = clientWith({
    data: [{ rank: '1', user_id: 'u1', display_name: 'Ana', points: '20', correct: '2', graded: '2', is_me: false }],
  });
  const rows = await fetchLeaderboard(client, 'friends', 'week', '2026-11-10');
  expect(rpc).toHaveBeenCalledWith('leaderboard', { p_scope: 'friends', p_period: 'week', p_today: '2026-11-10', p_limit: 100 });
  expect(rows[0].points).toBe(20);
});

it('turns the limit error into LeagueLimitError', async () => {
  const { client } = clientWith({ error: { code: 'CI424', message: 'Free players can create 1 league(s). Pro removes the limit.' } });
  await expect(createLeague(client, 'Second')).rejects.toBeInstanceOf(LeagueLimitError);
});

it('turns an unknown code into InviteNotFoundError', async () => {
  const { client } = clientWith({ error: { code: 'P0002', message: 'That invite link is not valid any more.' } });
  await expect(joinLeague(client, 'ZZZZZZZZ')).rejects.toBeInstanceOf(InviteNotFoundError);
});

it('passes other errors through', async () => {
  const { client } = clientWith({ error: { code: '42501', message: 'Sign in first.' } });
  await expect(joinLeague(client, 'ABCD2345')).rejects.toThrow('Sign in first.');
});

it('reads my leagues with no rank yet', async () => {
  const { client } = clientWith({
    data: [
      { id: 'l1', name: 'Crew', invite_code: 'ABCD2345', season_start: '2026-11-10', member_count: '3', is_owner: true, my_rank: null, my_points: null },
    ],
  });
  const [league] = await fetchMyLeagues(client, '2026-11-10');
  expect(league).toMatchObject({ member_count: 3, is_owner: true, my_rank: null, my_points: null });
});
