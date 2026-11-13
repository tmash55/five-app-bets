/**
 * What every reveal is made of. The page plays "the reveal for this rarity" through this shape alone, so it
 * never needs to know which one it is playing.
 *
 * A reveal is a timeline on one clock (milliseconds since the card reached the middle). Its sounds, buzzes,
 * shakes and flashes are data on that timeline; what it draws are a few layers the page stacks in order,
 * each driven by the same clock. Jumping the clock to `length` is the reveal's end state, so skipping is
 * one assignment.
 */

import type { ComponentType, ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { SfxName } from '@/audio/sound';
import type { Rarity } from '@/data/types';
import type { Buzz } from '@/fx/feedback';
import type { RevealTimes } from './times';

/** Something heard or felt at a moment of the reveal. */
export interface Cue {
  at: number;
  sfx?: SfxName;
  volume?: number;
  buzz?: Buzz;
  /** the payoff: when the reveal is skipped before it, it plays at once, so it is always heard once */
  stinger?: boolean;
}

/** A shake (`amount` is how far, in screen points) or a flash (`amount` is how white, 0..1) over `ms` from `at`. */
export interface Pulse {
  at: number;
  ms: number;
  amount: number;
}

export interface StageProps {
  /** milliseconds since the card reached the middle: negative while it is still on its way */
  clock: SharedValue<number>;
  /** the card's size */
  width: number;
  height: number;
  /** the whole screen */
  screen: { width: number; height: number };
  /** the middle of the card on the screen while the reveal plays */
  at: { x: number; y: number };
}

export interface CardProps extends StageProps {
  /** the card face-up: hidden until the reveal turns it over */
  face: ReactNode;
}

export interface Reveal extends RevealTimes {
  rarity: Rarity;
  /** its name, for the people working on it */
  name: string;
  cues: readonly Cue[];
  shakes: readonly Pulse[];
  flashes: readonly Pulse[];
  /** the card itself: its back, its face, and how it moves, turns and swaps one for the other */
  Card: ComponentType<CardProps>;
  /** fixed to the screen, under the card: the room dimming, spotlights, a beam, marquee lights */
  Room?: ComponentType<StageProps>;
  /** behind the card and moving with it, centred on its middle */
  Behind?: ComponentType<StageProps>;
  /** in front of the card and moving with it, centred on its middle */
  Front?: ComponentType<StageProps>;
  /** fixed to the screen, over everything: confetti raining down */
  Over?: ComponentType<StageProps>;
}
