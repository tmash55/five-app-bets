import { timedFetch } from '../timedFetch';

/** a `fetch` that answers after `ms`, or never; it ends when its signal does, as the real one would */
function slowFetch(ms: number | null) {
  const seen: { signal: AbortSignal | null | undefined }[] = [];
  const inner = ((_input: unknown, init?: RequestInit) => {
    seen.push({ signal: init?.signal });
    return new Promise<Response>((answer, fail) => {
      if (init?.signal?.aborted) return fail(init.signal.reason);
      const timer = ms === null ? null : setTimeout(() => answer({ ok: true, status: 200 } as Response), ms);
      init?.signal?.addEventListener('abort', () => {
        if (timer !== null) clearTimeout(timer);
        fail(init.signal?.reason ?? new Error('aborted'));
      });
    });
  }) as typeof fetch;
  return { inner, seen };
}

describe('timedFetch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('hands back an answer that comes in time', async () => {
    const { inner } = slowFetch(200);
    const going = timedFetch(inner, 1000)('https://account.test/x');
    await jest.advanceTimersByTimeAsync(200);
    await expect(going).resolves.toMatchObject({ status: 200 });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('gives up on a request that takes too long, and ends it', async () => {
    const { inner, seen } = slowFetch(null);
    const going = timedFetch(inner, 1000)('https://account.test/x');
    const failed = expect(going).rejects.toThrow('did not answer');
    await jest.advanceTimersByTimeAsync(1000);
    await failed;
    expect(seen[0].signal?.aborted).toBe(true);
  });

  it("still ends early when the caller's own signal does", async () => {
    const { inner } = slowFetch(null);
    const mine = new AbortController();
    const going = timedFetch(inner, 1000)('https://account.test/x', { signal: mine.signal });
    const failed = expect(going).rejects.toThrow('changed my mind');
    mine.abort(new Error('changed my mind'));
    await failed;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start a request whose signal has already ended', async () => {
    const { inner, seen } = slowFetch(null);
    const mine = new AbortController();
    mine.abort(new Error('too late'));
    await expect(timedFetch(inner, 1000)('https://account.test/x', { signal: mine.signal })).rejects.toThrow('too late');
    expect(seen[0].signal?.aborted).toBe(true);
  });
});
