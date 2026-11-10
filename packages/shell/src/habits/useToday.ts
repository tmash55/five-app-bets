import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dayKey } from './streak';

/**
 * Today's local day key. Updates when the app comes back to the foreground and
 * at midnight while it stays open, so streak views roll over to the new day.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dayKey(new Date()));

  useEffect(() => {
    const refresh = () => setToday(dayKey(new Date()));
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, [today]);

  return today;
}
