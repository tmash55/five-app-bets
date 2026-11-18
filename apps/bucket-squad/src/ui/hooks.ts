/** Small shared hooks. */

import { useCallback, useEffect, useState } from 'react';

/**
 * `after(ms, fn)` runs something later and forgets about it if the screen
 * goes away first, so a timer never fires into a screen that has closed.
 */
export function useAfter(): (ms: number, fn: () => void) => void {
  const [timers] = useState(() => new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
    [timers],
  );
  return useCallback(
    (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    },
    [timers],
  );
}
