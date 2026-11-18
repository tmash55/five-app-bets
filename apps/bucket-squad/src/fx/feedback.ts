/** Little taps of sound and vibration that make buttons and big plays feel solid. */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { nudgeMusic, playSfx, type SfxName } from '@/audio/sound';

let hapticsOn = true;

export function setHapticsEnabled(on: boolean): void {
  hapticsOn = on;
}

export type Buzz = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

export function buzz(kind: Buzz = 'light'): void {
  if (!hapticsOn || Platform.OS === 'web') return;
  try {
    switch (kind) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        break;
    }
  } catch {
    // no vibration motor, no problem
  }
}

/** The standard button press. */
export function tapFeedback(sound: SfxName = 'tap'): void {
  nudgeMusic();
  playSfx(sound);
  buzz('light');
}
