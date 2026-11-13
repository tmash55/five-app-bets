import { Fredoka_500Medium, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setMusicEnabled, setSoundEnabled, warmSounds } from '@/audio/sound';
import { exposeForTooling } from '@/dev/expose';
import { setHapticsEnabled } from '@/fx/feedback';
import { useSave, useSaveReady } from '@/state/save';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (__DEV__) exposeForTooling();

export default function RootLayout() {
  const [loaded, error] = useFonts({ LilitaOne_400Regular, Fredoka_500Medium, Fredoka_700Bold });
  const saveReady = useSaveReady();
  const sound = useSave((s) => s.settings.sound);
  const music = useSave((s) => s.settings.music);
  const haptics = useSave((s) => s.settings.haptics);
  const ready = (loaded || !!error) && saveReady;

  useEffect(() => setSoundEnabled(sound), [sound]);
  useEffect(() => setMusicEnabled(music), [music]);
  useEffect(() => setHapticsEnabled(haptics), [haptics]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
    // the very first tap should already click
    if (ready) warmSounds(['tap', 'back']);
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {/* no swipe-back: in landscape it would fight the game pad's stick */}
      <Stack screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: color.sky } }} />
    </SafeAreaProvider>
  );
}
