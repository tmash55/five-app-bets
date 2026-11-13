import { Bungee_400Regular } from '@expo-google-fonts/bungee/400Regular';
import { ChakraPetch_500Medium } from '@expo-google-fonts/chakra-petch/500Medium';
import { ChakraPetch_600SemiBold } from '@expo-google-fonts/chakra-petch/600SemiBold';
import { ChakraPetch_700Bold } from '@expo-google-fonts/chakra-petch/700Bold';
import { Fredoka_500Medium, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { TiltNeon_400Regular } from '@expo-google-fonts/tilt-neon/400Regular';
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
import { night } from '@/theme/arcade';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (__DEV__) exposeForTooling();

export default function RootLayout() {
  // the match's own fonts, then the arcade's: block capitals, one bent tube, and scoreboard print
  const [loaded, error] = useFonts({ LilitaOne_400Regular, Fredoka_500Medium, Fredoka_700Bold, Bungee_400Regular, TiltNeon_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold, ChakraPetch_700Bold });
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
      <Stack screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: night.wallTop } }} />
    </SafeAreaProvider>
  );
}
