import { ShellProviders, useAuth, useTheme } from '@five/shell';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { shellConfig } from '@/env';
import { takePendingInvite } from '@/invite/pendingInvite';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, session } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // An invite link opened while signed out is saved by +native-intent; open it
  // once the player signs in or up. (Signed in already, the link opens the join screen directly.)
  const signedIn = Boolean(session);
  const wasSignedOut = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      wasSignedOut.current = true;
      return;
    }
    if (!wasSignedOut.current) return;
    wasSignedOut.current = false;
    takePendingInvite().then((code) => {
      if (code) router.push({ pathname: '/join/[code]', params: { code } });
    });
  }, [ready, signedIn]);

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
          <Stack.Screen name="review" options={{ headerShown: true, title: 'Review slate' }} />
          <Stack.Screen name="results" options={{ headerShown: true, title: 'Results' }} />
          <Stack.Screen name="league/[id]" options={{ headerShown: true, title: 'League' }} />
          <Stack.Screen name="join/[code]" options={{ headerShown: true, title: 'Join league' }} />
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
    <ShellProviders config={shellConfig}>
      <RootNavigator />
    </ShellProviders>
  );
}
