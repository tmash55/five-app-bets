import { useEffect, useState } from 'react';

import { tickInterval, type TodayQuestion } from './todayState';

/**
 * The current time on the database clock (phone clock + `offsetMs`), ticking
 * fast enough for the countdown to the next lock and stopping once all have locked.
 */
export function useSlateClock(questions: TodayQuestion[], offsetMs: number): Date {
  const [phoneNow, setPhoneNow] = useState(() => Date.now());
  const now = new Date(phoneNow + offsetMs);
  const interval = tickInterval(questions, now);
  useEffect(() => {
    if (interval === null) return;
    const id = setInterval(() => setPhoneNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
