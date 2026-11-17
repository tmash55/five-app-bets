import { easternHour } from '../slate/time.ts';

/**
 * Results are meant to be seen in the morning, so a slate that finishes grading
 * overnight waits until this hour (US Eastern) before its push goes out.
 */
export const RESULTS_PUSH_QUIET_HOURS = { from: 23, until: 9 } as const;

/** True when a results push may go out now (outside quiet hours, US Eastern). */
export function canSendResultsPush(now: Date, quiet = RESULTS_PUSH_QUIET_HOURS): boolean {
  const hour = easternHour(now);
  const inQuiet = quiet.from > quiet.until ? hour >= quiet.from || hour < quiet.until : hour >= quiet.from && hour < quiet.until;
  return !inQuiet;
}

/** The push sent to everyone who picked on a slate once it is fully graded. */
export function resultsPush(slateDate: string) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${slateDate}T12:00:00Z`),
  );
  return {
    title: 'Your results are in',
    body: `See how your ${weekday} picks did and how many points you earned.`,
    data: { url: `/results?date=${slateDate}` },
  };
}
