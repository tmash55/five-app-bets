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
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setMusicEnabled, setSoundEnabled, warmSounds } from '@/audio/sound';
import { exposeForTooling } from '@/dev/expose';
import { DevInsets } from '@/dev/insets';
import { setHapticsEnabled } from '@/fx/feedback';
import { useSave, useSaveReady } from '@/state/save';
import { night } from '@/theme/arcade';
import { Boot } from '@/ui/arcade/Boot';

SplashScreen.preventAutoHideAsync().catch(() => {});

// What shows behind every page. A phone keeps the last colour it was told, so it is told again at every start.
if (Platform.OS !== 'web') SystemUI.setBackgroundColorAsync(night.wallTop).catch(() => {});

if (__DEV__) exposeForTooling();

/**
 * The lit sign opens the game on a phone. In the browser it only plays when asked for with `?boot`,
 * so the tools that photograph pages never find it in their way.
 */
const OPENS_WITH_SIGN = Platform.OS !== 'web' || (__DEV__ && typeof location !== 'undefined' && /[?&]boot\b/.test(location.search));

export default function RootLayout() {
  // the match's own fonts, then the arcade's: block capitals, one bent tube, and scoreboard print
  const [loaded, error] = useFonts({ LilitaOne_400Regular, Fredoka_500Medium, Fredoka_700Bold, Bungee_400Regular, TiltNeon_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold, ChakraPetch_700Bold });
  const saveReady = useSaveReady();
  const sound = useSave((s) => s.settings.sound);
  const music = useSave((s) => s.settings.music);
  const haptics = useSave((s) => s.settings.haptics);
  const ready = (loaded || !!error) && saveReady;
  const [opening, setOpening] = useState(OPENS_WITH_SIGN);

  useEffect(() => setSoundEnabled(sound), [sound]);
  useEffect(() => setMusicEnabled(music), [music]);
  useEffect(() => setHapticsEnabled(haptics), [haptics]);

  useEffect(() => {
    // on a phone the lit sign takes the loading picture down itself, once it is drawn in its place
    if (ready && !OPENS_WITH_SIGN) SplashScreen.hideAsync().catch(() => {});
    // the very first tap should already click
    if (ready) warmSounds(['tap', 'back']);
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <DevInsets>
        <StatusBar hidden />
        {/* no swipe-back: in landscape it would fight the game pad's stick */}
        <Stack screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: night.wallTop } }} />
        {opening && <Boot onShown={() => SplashScreen.hideAsync().catch(() => {})} onDone={() => setOpening(false)} />}
      </DevInsets>
    </SafeAreaProvider>
  );
}
