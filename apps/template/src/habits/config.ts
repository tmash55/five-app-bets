import type { HabitsConfig } from '@five/shell';

/**
 * This app's streak and reminder settings. Each app edits its own copy:
 * maxFreezes 0 turns streak freezes off.
 */
export const habits: Omit<HabitsConfig, 'onNotificationOpened'> = {
  streak: { maxFreezes: 2 },
  reminder: {
    title: 'Time for today',
    body: "Today's round is ready.",
    streakBody: 'Keep your {streak}-day streak going.',
    defaultTime: { hour: 19, minute: 0 },
  },
};
