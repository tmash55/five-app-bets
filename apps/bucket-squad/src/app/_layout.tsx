import { Fredoka_500Medium, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({ LilitaOne_400Regular, Fredoka_500Medium, Fredoka_700Bold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: color.sky } }} />
    </SafeAreaProvider>
  );
}
