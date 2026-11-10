/**
 * Daily reminder rules, kept pure so they can be tested without a device.
 *
 * Instead of one repeating notification, the shell schedules one reminder per
 * day for the next `REMINDER_DAYS` days. That lets it skip today's reminder
 * once the user has already been active, and use the streak in the copy. The
 * list is rebuilt every time the app opens or the streak changes.
 */

export type ReminderTime = { hour: number; minute: number };

export type ReminderSettings = ReminderTime & { enabled: boolean };

export type ReminderCopy = {
  title: string;
  /** Used when there is no streak to keep. */
  body: string;
  /** Used when a streak is running. `{streak}` is replaced with its length. */
  streakBody?: string;
};

export type ReminderConfig = ReminderCopy & {
  /** The time offered before the user picks one. */
  defaultTime: ReminderTime;
};

export type PlannedReminder = {
  /** Stable per day, so rescheduling replaces rather than duplicates. */
  identifier: string;
  date: Date;
  title: string;
  body: string;
};

export const REMINDER_DAYS = 14;
export const REMINDER_ID_PREFIX = 'five.reminder.';

export const defaultReminderConfig: ReminderConfig = {
  title: 'Time for today',
  body: 'Your daily round is ready.',
  streakBody: 'Keep your {streak}-day streak going.',
  defaultTime: { hour: 19, minute: 0 },
};

export function isValidTime(time: ReminderTime): boolean {
  return (
    Number.isInteger(time.hour) &&
    Number.isInteger(time.minute) &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    time.minute >= 0 &&
    time.minute <= 59
  );
}

export function reminderBody(copy: ReminderCopy, streak: number): string {
  if (streak > 0 && copy.streakBody) return copy.streakBody.replace('{streak}', String(streak));
  return copy.body;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The reminders to schedule from `now`. `doneToday` skips today's reminder.
 * `streak` is the streak the user keeps by being active today; later days use
 * the plain body because the streak by then is unknown.
 */
export function planReminders({
  settings,
  copy,
  now,
  doneToday,
  streak,
  days = REMINDER_DAYS,
}: {
  settings: ReminderSettings;
  copy: ReminderCopy;
  now: Date;
  doneToday: boolean;
  streak: number;
  days?: number;
}): PlannedReminder[] {
  if (!settings.enabled || !isValidTime(settings)) return [];
  const planned: PlannedReminder[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      settings.hour,
      settings.minute,
      0,
      0,
    );
    if (date.getTime() <= now.getTime()) continue;
    if (offset === 0 && doneToday) continue;
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    planned.push({
      identifier: `${REMINDER_ID_PREFIX}${key}`,
      date,
      title: copy.title,
      // A reminder later today can mention the streak at stake; later days
      // depend on what the user does, so they get the plain line.
      body: offset === 0 ? reminderBody(copy, streak) : copy.body,
    });
  }
  return planned;
}

/** "7:00 PM" style label in the device's locale. */
export function formatReminderTime(time: ReminderTime, locale?: string): string {
  const date = new Date(2000, 0, 1, time.hour, time.minute);
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function parseReminderSettings(value: unknown): ReminderSettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') return null;
  const time = { hour: v.hour as number, minute: v.minute as number };
  if (!isValidTime(time)) return null;
  return { enabled: v.enabled, ...time };
}
