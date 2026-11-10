import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from './auth/AuthProvider';
import type { ShellConfig } from './config/env';
import { StreakProvider } from './habits/StreakProvider';
import type { ReminderConfig } from './habits/reminders';
import type { StreakRules } from './habits/streak';
import {
  NotificationsProvider,
  type NotificationData,
} from './notifications/NotificationsProvider';
import { PurchasesProvider } from './purchases/PurchasesProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import type { ThemeOverrides } from './theme/tokens';

function PurchasesForUser({ config, children }: { config: ShellConfig; children: ReactNode }) {
  const { session } = useAuth();
  return (
    <PurchasesProvider revenueCat={config.revenueCat} appUserId={session?.user.id ?? null}>
      {children}
    </PurchasesProvider>
  );
}

/** Per-app streak and reminder settings. Everything is optional. */
export type HabitsConfig = {
  streak?: StreakRules;
  reminder?: ReminderConfig;
  /** Called when the user taps a reminder or server push; usually routes to `data.url`. */
  onNotificationOpened?: (data: NotificationData) => void;
};

/** Everything a shell app wraps its root layout in. */
export function ShellProviders({
  config,
  theme,
  habits,
  children,
}: {
  config: ShellConfig;
  theme?: ThemeOverrides;
  habits?: HabitsConfig;
  children: ReactNode;
}) {
  return (
    <ThemeProvider overrides={theme}>
      <AuthProvider supabase={config.supabase}>
        <PurchasesForUser config={config}>
          <StreakProvider rules={habits?.streak}>
            <NotificationsProvider
              reminder={habits?.reminder}
              onNotificationOpened={habits?.onNotificationOpened}>
              {children}
            </NotificationsProvider>
          </StreakProvider>
        </PurchasesForUser>
      </AuthProvider>
    </ThemeProvider>
  );
}
