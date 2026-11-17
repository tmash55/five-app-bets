import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchToday, makePick, PickLockedError } from '../src/today/api';

type Result = { data: unknown; error: unknown };

/** A tiny stand-in for the Supabase query builder: each table returns a fixed result. */
function fakeClient(tables: Record<string, Result>, rpc: Record<string, Result>) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as unknown[][] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) {
      builder[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(tables[table]);
    builder.returns = () => Promise.resolve(tables[table]);
    return builder;
  };
  const client = {
    from,
    rpc: jest.fn((name: string) => Promise.resolve(rpc[name])),
  } as unknown as SupabaseClient & { rpc: jest.Mock };
  return { client, calls };
}

describe('fetchToday', () => {
  it('loads only a published slate with included questions and my picks', async () => {
    const serverNow = new Date(Date.now() + 5_000).toISOString();
    const { client, calls } = fakeClient(
      {
        slates: { data: { id: 's1', slate_date: '2026-11-10' }, error: null },
        questions: { data: [{ id: 'q1' }, { id: 'q2' }], error: null },
        picks: { data: [{ question_id: 'q2', answer: false }], error: null },
      },
      { server_now: { data: serverNow, error: null } },
    );
    const today = await fetchToday(client, '2026-11-10');
    expect(today.slate?.id).toBe('s1');
    expect(today.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(today.picks).toEqual({ q2: false });
    expect(today.clockOffsetMs).toBeGreaterThan(4_000);
    expect(calls[0].filters).toContainEqual(['eq', 'status', 'published']);
    expect(calls[1].filters).toContainEqual(['eq', 'included', true]);
    expect(calls[2].filters).toContainEqual(['in', 'question_id', ['q1', 'q2']]);
  });

  it('returns an empty day when nothing is published', async () => {
    const { client } = fakeClient(
      { slates: { data: null, error: null } },
      { server_now: { data: null, error: { message: 'down' } } },
    );
    expect(await fetchToday(client, '2026-11-10')).toEqual({
      slate: null,
      questions: [],
      picks: {},
      clockOffsetMs: 0,
    });
  });
});

describe('makePick', () => {
  it('calls make_pick', async () => {
    const { client } = fakeClient({}, { make_pick: { data: {}, error: null } });
    await makePick(client, 'q1', true);
    expect(client.rpc).toHaveBeenCalledWith('make_pick', { p_question_id: 'q1', p_answer: true });
  });

  it('turns the lock error into PickLockedError', async () => {
    const { client } = fakeClient(
      {},
      { make_pick: { data: null, error: { code: 'CI423', message: 'This game has started, so the pick is locked.' } } },
    );
    await expect(makePick(client, 'q1', true)).rejects.toBeInstanceOf(PickLockedError);
  });

  it('passes other errors through', async () => {
    const { client } = fakeClient({}, { make_pick: { data: null, error: { code: 'P0002', message: 'nope' } } });
    await expect(makePick(client, 'q1', true)).rejects.toThrow('nope');
  });
});
