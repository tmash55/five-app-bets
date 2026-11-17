/**
 * A time limit for every request to the account. Left alone, a request on a dead or crawling line waits as long as
 * the system lets it (a minute on an iPhone, for ever in a browser), and whatever the grown-up asked for sits on
 * "Checking your account…" all that time. With a limit the request fails like any other lost connection: the game
 * carries on from the device and the account is tried again later.
 */

/** long enough for a small save on a slow phone line, short enough that nobody is left looking at a pop-up */
export const ACCOUNT_TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

/** named as an ended request is, so nothing downstream takes it for a failure worth trying again at once */
function outOfTime(ms: number): Error {
  const e = new Error(`The account did not answer in ${ms} ms.`);
  e.name = 'AbortError';
  return e;
}

/** `fetch`, given up after `ms`. A caller's own `signal` still ends it early. */
export function timedFetch(inner: Fetch, ms: number = ACCOUNT_TIMEOUT_MS): Fetch {
  return async (input, init) => {
    const limit = new AbortController();
    const asked = init?.signal ?? null;
    const pass = () => limit.abort(asked?.reason);
    if (asked?.aborted) pass();
    else asked?.addEventListener('abort', pass, { once: true });
    const timer = setTimeout(() => limit.abort(outOfTime(ms)), ms);
    try {
      return await inner(input, { ...init, signal: limit.signal });
    } finally {
      clearTimeout(timer);
      asked?.removeEventListener('abort', pass);
    }
  };
}
