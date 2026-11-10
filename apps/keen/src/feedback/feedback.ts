import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/**
 * Sound and haptic feedback for Keen games. Sounds respect the silent switch
 * (they never play over it), haptics always fire. Every call is fire and
 * forget: a device without a speaker or haptics engine must never break a game.
 */
export type FeedbackKind = 'right' | 'wrong' | 'tap';

const sources = {
  right: require('../../assets/sounds/right.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
};

let players: Partial<Record<'right' | 'wrong', AudioPlayer>> = {};
let audioModeSet = false;

function player(kind: 'right' | 'wrong'): AudioPlayer | null {
  try {
    if (!audioModeSet) {
      audioModeSet = true;
      // Mix with music the player has on; stay quiet when the phone is on silent.
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    players[kind] ??= createAudioPlayer(sources[kind]);
    return players[kind] ?? null;
  } catch {
    return null;
  }
}

function play(kind: 'right' | 'wrong') {
  const sound = player(kind);
  if (!sound) return;
  try {
    // Rewind so quick answers in a row each get their own sound.
    sound.seekTo(0).catch(() => {});
    sound.play();
  } catch {
    // Ignore: feedback is best effort.
  }
}

export function giveFeedback(kind: FeedbackKind) {
  if (kind === 'tap') {
    Haptics.selectionAsync().catch(() => {});
    return;
  }
  play(kind);
  Haptics.notificationAsync(
    kind === 'right' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  ).catch(() => {});
}

/** Loads both sounds ahead of the first answer so it is not delayed. */
export function preloadFeedback() {
  player('right');
  player('wrong');
}

/** Frees the sound players, for when the game screen closes. */
export function releaseFeedback() {
  for (const sound of Object.values(players)) {
    try {
      sound?.remove();
    } catch {
      // Already released.
    }
  }
  players = {};
}
