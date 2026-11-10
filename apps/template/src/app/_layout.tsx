import { ShellProviders, useAuth, useTheme } from '@five/shell';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { shellConfig } from '@/env';
import { habits } from '@/habits/config';
import { navigatorGone, navigatorReady, openNotification } from '@/habits/openNotification';

const habitsWithRouting = { ...habits, onNotificationOpened: openNotification };

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, session } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Open a notification tap that arrived while the app was starting.
  useEffect(() => {
    if (!ready) return;
    navigatorReady();
    return navigatorGone;
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ShellProviders config={shellConfig} habits={habitsWithRouting}>
      <RootNavigator />
    </ShellProviders>
  );
}
