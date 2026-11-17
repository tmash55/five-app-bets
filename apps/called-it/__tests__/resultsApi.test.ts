import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchResults } from '../src/results/api';

type Result = { data?: unknown; error: unknown; count?: number | null };

/** Stand-in for the query builder. Each table answers from a queue, in call order. */
function fakeClient(tables: Record<string, Result[]>, streak: Result) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as unknown[][] };
    calls.push(call);
    const answer = () => Promise.resolve(tables[table].shift());
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'lte', 'not']) {
      builder[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args]);
        return builder;
      };
    }
    builder.limit = (...args: unknown[]) => {
      call.filters.push(['limit', ...args]);
      return builder;
    };
    builder.maybeSingle = answer;
    builder.returns = answer;
    // The count query is awaited directly.
    builder.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => answer().then(resolve, reject);
    return builder;
  };
  const client = { from, rpc: jest.fn(() => Promise.resolve(streak)) } as unknown as SupabaseClient;
  return { client, calls };
}

const slate = (id: string, slate_date: string) => ({ id, slate_date, graded_at: null });

it('shows the latest earlier slate when today has no results yet', async () => {
  const { client, calls } = fakeClient(
    {
      slates: [{ data: [slate('today', '2026-11-11'), slate('yday', '2026-11-10')], error: null }],
      questions: [
        { count: 0, error: null },
        { data: [{ id: 'q1', result_value: '31', position: 1 }], error: null },
      ],
      picks: [{ data: [{ question_id: 'q1', answer: true, correct: true, base_points: 10, bonus_points: 0 }], error: null }],
    },
    { data: 4, error: null },
  );
  const result = await fetchResults(client, '2026-11-11');
  expect(result.slate?.id).toBe('yday');
  expect(result.questions[0].result_value).toBe(31);
  expect(result.picks.q1.base_points).toBe(10);
  expect(result.streak).toBe(4);
  const slateQuery = calls.find((c) => c.table === 'slates')!;
  expect(slateQuery.filters).toContainEqual(['eq', 'status', 'published']);
  expect(slateQuery.filters).toContainEqual(['lte', 'slate_date', '2026-11-11']);
});

it("shows today's slate once a question on it is graded", async () => {
  const { client } = fakeClient(
    {
      slates: [{ data: [slate('today', '2026-11-11'), slate('yday', '2026-11-10')], error: null }],
      questions: [{ count: 2, error: null }, { data: [], error: null }],
      picks: [],
    },
    { data: 1, error: null },
  );
  expect((await fetchResults(client, '2026-11-11')).slate?.id).toBe('today');
});

it('loads the slate for a given date', async () => {
  const { client, calls } = fakeClient(
    { slates: [{ data: slate('s9', '2026-11-09'), error: null }], questions: [{ data: [], error: null }], picks: [] },
    { data: null, error: { message: 'x' } },
  );
  const result = await fetchResults(client, '2026-11-11', '2026-11-09');
  expect(result.slate?.id).toBe('s9');
  expect(result.streak).toBe(0);
  expect(calls[0].filters).toContainEqual(['eq', 'slate_date', '2026-11-09']);
});

it('returns no slate when there are none', async () => {
  const { client } = fakeClient({ slates: [{ data: [], error: null }], questions: [], picks: [] }, { data: 0, error: null });
  expect(await fetchResults(client, '2026-11-11')).toEqual({ slate: null, questions: [], picks: {}, streak: 0 });
});
