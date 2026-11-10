import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { AuthProvider } from '../auth/AuthProvider';
import { StreakProvider, STREAK_STORAGE_KEY, useStreak } from '../habits/StreakProvider';
import { REMINDER_ID_PREFIX } from '../habits/reminders';
import { NotificationsProvider, REMINDER_SETTINGS_KEY } from '../notifications/NotificationsProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { PushPermissionPrompt } from '../ui/PushPermissionPrompt';
import { StreakBadge } from '../ui/StreakBadge';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-device', () => ({ isDevice: false }));

jest.mock('expo-notifications', () => {
  const scheduled = new Map<string, unknown>();
  return {
    __scheduled: scheduled,
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      [...scheduled.keys()].map((identifier) => ({ identifier })),
    ),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
    scheduleNotificationAsync: jest.fn(async (request: { identifier: string }) => {
      scheduled.set(request.identifier, request);
      return request.identifier;
    }),
    getLastNotificationResponse: jest.fn(() => null),
    clearLastNotificationResponse: jest.fn(),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    getExpoPushTokenAsync: jest.fn(),
  };
});

const scheduled = (Notifications as unknown as { __scheduled: Map<string, unknown> }).__scheduled;

function PlayButton() {
  const streak = useStreak();
  return <Button title="Play" onPress={() => streak.recordActivity()} />;
}

async function renderHabits() {
  await render(
    <ThemeProvider>
      <AuthProvider supabase={null}>
        <StreakProvider rules={{ maxFreezes: 1 }}>
          <NotificationsProvider>
            <StreakBadge />
            <PlayButton />
            <PushPermissionPrompt />
          </NotificationsProvider>
        </StreakProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

function todayKey() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  scheduled.clear();
  jest.clearAllMocks();
});

describe('streak and reminders together', () => {
  it('records today once, saves it, and shows the streak', async () => {
    await renderHabits();
    expect(await screen.findByText('Play today to start a streak')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Play'));
    expect(await screen.findByText('Done for today')).toBeOnTheScreen();
    expect(screen.getByText('1 day')).toBeOnTheScreen();

    const saved = JSON.parse((await AsyncStorage.getItem(STREAK_STORAGE_KEY))!);
    expect(saved).toMatchObject({ current: 1, lastActiveDay: todayKey() });
  });

  it('turns the reminder on when the user allows notifications, and schedules no reminder for a day already played', async () => {
    await renderHabits();
    await fireEvent.press(await screen.findByText('Play'));
    await fireEvent.press(await screen.findByText('Turn on'));

    await waitFor(() => expect(scheduled.size).toBe(13));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect([...scheduled.keys()]).not.toContain(`${REMINDER_ID_PREFIX}${todayKey()}`);
    const saved = JSON.parse((await AsyncStorage.getItem(REMINDER_SETTINGS_KEY))!);
    expect(saved.enabled).toBe(true);
    // The prompt goes away once answered.
    await waitFor(() => expect(screen.queryByText('Turn on')).toBeNull());
  });

  it('hides the prompt after "Not now"', async () => {
    await renderHabits();
    await fireEvent.press(await screen.findByText('Not now'));
    await waitFor(() => expect(screen.queryByText('Not now')).toBeNull());
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduled.size).toBe(0);
  });

  it('keeps a streak saved on an earlier day', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    await AsyncStorage.setItem(
      STREAK_STORAGE_KEY,
      JSON.stringify({
        current: 6,
        longest: 6,
        lastActiveDay: key,
        freezes: 0,
        frozenDays: [],
        updatedAt: yesterday.toISOString(),
      }),
    );
    await renderHabits();
    expect(await screen.findByText('Play today to keep it going')).toBeOnTheScreen();
    expect(screen.getByText('6 days')).toBeOnTheScreen();
    await act(async () => {
      await fireEvent.press(screen.getByText('Play'));
    });
    expect(await screen.findByText('7 days')).toBeOnTheScreen();
  });
});
