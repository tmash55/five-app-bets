import { OnboardingProvider, ShellProviders, useAuth, useOnboarding, useTheme } from '@five/shell';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { analyticsOptions, shellConfig } from '@/env';
import { onboardingQuiz } from '@/onboarding/quiz';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, session } = useAuth();
  const onboarding = useOnboarding();
  const theme = useTheme();
  const loaded = ready && onboarding.ready;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  // New users take the onboarding quiz and see the paywall before signing up.
  const onboarded = onboarding.completed;

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded && Boolean(session)}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded && !session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ShellProviders config={shellConfig} analytics={analyticsOptions}>
      <OnboardingProvider quizId={onboardingQuiz.id}>
        <RootNavigator />
      </OnboardingProvider>
    </ShellProviders>
  );
}
