import {
  defaultReminderConfig,
  formatReminderTime,
  parseReminderSettings,
  planReminders,
  reminderBody,
  REMINDER_ID_PREFIX,
} from '../habits/reminders';

const settings = { enabled: true, hour: 19, minute: 30 };
const copy = { title: 'Daily', body: 'Ready.', streakBody: 'Keep your {streak}-day streak.' };

describe('planReminders', () => {
  it('plans one reminder a day at the chosen time, starting today if still ahead', () => {
    const now = new Date(2026, 10, 10, 9, 0);
    const plan = planReminders({ settings, copy, now, doneToday: false, streak: 0, days: 3 });
    expect(plan.map((p) => p.identifier)).toEqual([
      `${REMINDER_ID_PREFIX}2026-11-10`,
      `${REMINDER_ID_PREFIX}2026-11-11`,
      `${REMINDER_ID_PREFIX}2026-11-12`,
    ]);
    expect(plan[0].date.getHours()).toBe(19);
    expect(plan[0].date.getMinutes()).toBe(30);
  });

  it("skips today's reminder once the user has played", () => {
    const now = new Date(2026, 10, 10, 9, 0);
    const plan = planReminders({ settings, copy, now, doneToday: true, streak: 4, days: 3 });
    expect(plan[0].identifier).toBe(`${REMINDER_ID_PREFIX}2026-11-11`);
    expect(plan).toHaveLength(2);
  });

  it("skips today's reminder once its time has passed", () => {
    const now = new Date(2026, 10, 10, 20, 0);
    const plan = planReminders({ settings, copy, now, doneToday: false, streak: 0, days: 2 });
    expect(plan.map((p) => p.identifier)).toEqual([`${REMINDER_ID_PREFIX}2026-11-11`]);
  });

  it('mentions the streak at stake only in a reminder for today', () => {
    const now = new Date(2026, 10, 10, 9, 0);
    const plan = planReminders({ settings, copy, now, doneToday: false, streak: 5, days: 2 });
    expect(plan[0].body).toBe('Keep your 5-day streak.');
    expect(plan[1].body).toBe('Ready.');
  });

  it('plans nothing when the reminder is off or the time is invalid', () => {
    const now = new Date(2026, 10, 10, 9, 0);
    expect(planReminders({ settings: { ...settings, enabled: false }, copy, now, doneToday: false, streak: 0 })).toEqual([]);
    expect(planReminders({ settings: { ...settings, hour: 24 }, copy, now, doneToday: false, streak: 0 })).toEqual([]);
  });

  it('plans 14 days by default, under the iOS limit of 64 pending notifications', () => {
    const now = new Date(2026, 10, 10, 9, 0);
    expect(planReminders({ settings, copy, now, doneToday: false, streak: 0 })).toHaveLength(14);
  });
});

describe('reminder helpers', () => {
  it('falls back to the plain body without a streak', () => {
    expect(reminderBody(copy, 0)).toBe('Ready.');
    expect(reminderBody({ title: 't', body: 'b' }, 3)).toBe('b');
  });

  it('formats times for display', () => {
    expect(formatReminderTime({ hour: 19, minute: 5 }, 'en-US')).toMatch(/7:05\s?PM/);
  });

  it('reads saved settings and rejects bad ones', () => {
    expect(parseReminderSettings({ enabled: true, hour: 8, minute: 0 })).toEqual({ enabled: true, hour: 8, minute: 0 });
    expect(parseReminderSettings({ enabled: 'yes', hour: 8, minute: 0 })).toBeNull();
    expect(parseReminderSettings({ enabled: true, hour: 8, minute: 61 })).toBeNull();
  });

  it('has a default time in range', () => {
    expect(defaultReminderConfig.defaultTime.hour).toBeLessThan(24);
  });
});
