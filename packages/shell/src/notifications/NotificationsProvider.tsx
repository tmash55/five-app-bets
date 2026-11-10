import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useStreak } from '../habits/StreakProvider';
import {
  defaultReminderConfig,
  parseReminderSettings,
  planReminders,
  REMINDER_ID_PREFIX,
  type ReminderConfig,
  type ReminderSettings,
  type ReminderTime,
} from '../habits/reminders';

export const REMINDER_SETTINGS_KEY = 'five.reminder';
export const PUSH_PROMPT_KEY = 'five.push-prompt';
/** Supabase table, see apps/template/supabase/migrations. */
export const PUSH_TOKENS_TABLE = 'push_tokens';
export const REGISTER_PUSH_TOKEN_RPC = 'register_push_token';
export const REMINDER_CHANNEL_ID = 'reminders';
export const UPDATES_CHANNEL_ID = 'updates';
/** Ask again this long after the user taps "Not now" on the soft prompt. */
export const PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export type PermissionState = {
  status: 'granted' | 'denied' | 'undetermined';
  /** False once the system will no longer show its prompt; send people to Settings instead. */
  canAskAgain: boolean;
};

export type PushRegistration =
  | { status: 'idle' }
  | { status: 'registered'; token: string }
  /** Simulators, emulators and web cannot get push tokens. */
  | { status: 'unsupported' }
  /** Missing EAS project ID or Supabase keys; `reason` says which. */
  | { status: 'not-configured'; reason: string }
  | { status: 'error'; message: string };

/** The `data` payload a server push or reminder carries. */
export type NotificationData = Record<string, unknown> & {
  /** In-app route to open when the notification is tapped, for example "/results". */
  url?: string;
  kind?: string;
};

export type NotificationsContextValue = {
  ready: boolean;
  permission: PermissionState;
  reminder: ReminderSettings;
  registration: PushRegistration;
  /** True when the app's soft prompt should be shown now. */
  shouldShowPrompt: boolean;
  /**
   * Shows the system permission prompt. Apps call this at the moment they
   * choose, usually from `PushPermissionPrompt`. Turns the reminder on when granted.
   */
  requestPermission: () => Promise<boolean>;
  /** Records "Not now" on the soft prompt so it stays hidden for a few days. */
  snoozePrompt: () => Promise<void>;
  setReminderEnabled: (enabled: boolean) => Promise<void>;
  setReminderTime: (time: ReminderTime) => Promise<void>;
  /** Removes this device's push token from the account. Call before signing out. */
  unregisterDevice: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Show notifications that arrive while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function toPermissionState(response: Notifications.NotificationPermissionsStatus): PermissionState {
  const status = response.status === 'granted' ? 'granted' : response.status === 'denied' ? 'denied' : 'undetermined';
  return { status, canAskAgain: response.canAskAgain };
}

export function easProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Daily reminder',
    importance: AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(UPDATES_CHANNEL_ID, {
    name: 'Results and updates',
    importance: AndroidImportance.HIGH,
  });
}

async function rescheduleReminders(
  reminder: ReminderSettings,
  config: ReminderConfig,
  doneToday: boolean,
  streak: number,
) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const planned = planReminders({ settings: reminder, copy: config, now: new Date(), doneToday, streak });
  for (const item of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: { title: item.title, body: item.body, data: { kind: 'daily-reminder', url: '/' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.date,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  }
}

export function NotificationsProvider({
  reminder: reminderConfig = defaultReminderConfig,
  onNotificationOpened,
  children,
}: {
  reminder?: ReminderConfig;
  /** Called when the user taps a reminder or a server push, including on a cold start. */
  onNotificationOpened?: (data: NotificationData) => void;
  children: ReactNode;
}) {
  const { client, session } = useAuth();
  const userId = session?.user.id ?? null;
  const streak = useStreak();
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<PermissionState>({
    status: 'undetermined',
    canAskAgain: true,
  });
  const [reminder, setReminder] = useState<ReminderSettings>({
    enabled: false,
    ...reminderConfig.defaultTime,
  });
  const [promptSnoozed, setPromptSnoozed] = useState(false);
  const [registration, setRegistration] = useState<PushRegistration>({ status: 'idle' });
  const scheduling = useRef<Promise<void>>(Promise.resolve());
  const openedRef = useRef(onNotificationOpened);
  useEffect(() => {
    openedRef.current = onNotificationOpened;
  }, [onNotificationOpened]);

  // Read saved settings and the current permission.
  useEffect(() => {
    let active = true;
    (async () => {
      const [rawReminder, rawPrompt, perms] = await Promise.all([
        AsyncStorage.getItem(REMINDER_SETTINGS_KEY).catch(() => null),
        AsyncStorage.getItem(PUSH_PROMPT_KEY).catch(() => null),
        Notifications.getPermissionsAsync(),
        ensureAndroidChannels().catch(() => undefined),
      ]);
      if (!active) return;
      let saved: ReminderSettings | null = null;
      try {
        saved = rawReminder ? parseReminderSettings(JSON.parse(rawReminder)) : null;
      } catch {
        saved = null;
      }
      if (saved) setReminder(saved);
      const snoozed = rawPrompt ? Number(rawPrompt) : NaN;
      setPromptSnoozed(Number.isFinite(snoozed) && Date.now() - snoozed < PROMPT_SNOOZE_MS);
      setPermission(toPermissionState(perms));
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // The user can change the permission in system settings while the app is in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      Notifications.getPermissionsAsync()
        .then((perms) => setPermission(toPermissionState(perms)))
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  const saveReminder = useCallback(async (next: ReminderSettings) => {
    setReminder(next);
    await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  // Keep the scheduled reminders in step with the settings and today's streak.
  const doneToday = streak.status === 'done-today';
  const streakAtStake = streak.status === 'at-risk' ? streak.current : 0;
  useEffect(() => {
    if (!ready || !streak.ready) return;
    const active = permission.status === 'granted' ? reminder : { ...reminder, enabled: false };
    // Run one reschedule at a time so a quick run of changes cannot interleave.
    scheduling.current = scheduling.current
      .then(() => rescheduleReminders(active, reminderConfig, doneToday, streakAtStake))
      .catch((error) => console.warn(`[shell] Could not schedule reminders: ${String(error)}`));
  }, [ready, streak.ready, permission.status, reminder, reminderConfig, doneToday, streakAtStake, streak.today]);

  // Register this device for server pushes once allowed and signed in.
  useEffect(() => {
    if (permission.status !== 'granted' || !userId) return;
    let active = true;
    (async () => {
      if (!Device.isDevice || Platform.OS === 'web') {
        setRegistration({ status: 'unsupported' });
        return;
      }
      const projectId = easProjectId();
      if (!projectId) {
        setRegistration({ status: 'not-configured', reason: 'EAS project ID is not set (EAS_PROJECT_ID).' });
        return;
      }
      if (!client) {
        setRegistration({ status: 'not-configured', reason: 'Supabase keys are not set.' });
        return;
      }
      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        const { error } = await client.rpc(REGISTER_PUSH_TOKEN_RPC, {
          p_token: token,
          p_platform: Platform.OS,
        });
        if (error) throw error;
        if (active) setRegistration({ status: 'registered', token });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (active) setRegistration({ status: 'error', message });
      }
    })();
    return () => {
      active = false;
    };
  }, [permission.status, userId, client]);

  // Route taps on reminders and server pushes, including the one that launched the app.
  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = (response.notification.request.content.data ?? {}) as NotificationData;
      openedRef.current?.(data);
    };
    const last = Notifications.getLastNotificationResponse();
    handle(last);
    if (last) Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, []);

  const requestPermission = useCallback(async () => {
    const response = await Notifications.requestPermissionsAsync();
    const next = toPermissionState(response);
    setPermission(next);
    if (next.status === 'granted' && !reminder.enabled) await saveReminder({ ...reminder, enabled: true });
    return next.status === 'granted';
  }, [reminder, saveReminder]);

  const snoozePrompt = useCallback(async () => {
    setPromptSnoozed(true);
    await AsyncStorage.setItem(PUSH_PROMPT_KEY, String(Date.now())).catch(() => undefined);
  }, []);

  const setReminderEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled && permission.status !== 'granted') {
        const granted = await requestPermission();
        if (!granted) return;
      }
      await saveReminder({ ...reminder, enabled });
    },
    [permission.status, reminder, requestPermission, saveReminder],
  );

  const setReminderTime = useCallback(
    (time: ReminderTime) => saveReminder({ ...reminder, ...time }),
    [reminder, saveReminder],
  );

  const unregisterDevice = useCallback(async () => {
    if (registration.status !== 'registered' || !client) return;
    const { error } = await client.from(PUSH_TOKENS_TABLE).delete().eq('token', registration.token);
    if (error) console.warn(`[shell] Could not remove the push token: ${error.message}`);
    setRegistration({ status: 'idle' });
  }, [client, registration]);

  const shouldShowPrompt =
    ready &&
    permission.status === 'undetermined' &&
    permission.canAskAgain &&
    !promptSnoozed;

  const value = useMemo<NotificationsContextValue>(
    () => ({
      ready,
      permission,
      reminder,
      registration,
      shouldShowPrompt,
      requestPermission,
      snoozePrompt,
      setReminderEnabled,
      setReminderTime,
      unregisterDevice,
    }),
    [
      ready,
      permission,
      reminder,
      registration,
      shouldShowPrompt,
      requestPermission,
      snoozePrompt,
      setReminderEnabled,
      setReminderTime,
      unregisterDevice,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside <ShellProviders>.');
  return value;
}
