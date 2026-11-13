/** The reveal for each rarity, and the plain fade that stands in for all of them when the phone asks for less motion. */

import type { SfxName } from '@/audio/sound';
import type { Rarity } from '@/data/types';
import type { Buzz } from '@/fx/feedback';
import { commonReveal } from './common';
import { epicReveal } from './epic';
import { fadeReveal } from './fade';
import { legendReveal } from './legend';
import { rareReveal } from './rare';
import type { Reveal } from './types';

export const REVEALS: Record<Rarity, Reveal> = {
  common: commonReveal,
  rare: rareReveal,
  epic: epicReveal,
  legend: legendReveal,
};

/** with less motion every card fades the same way, but still sounds and feels like its rarity */
const FADE_CUE: Record<Rarity, { sfx: SfxName; buzz: Buzz }> = {
  common: { sfx: 'revealCommon', buzz: 'light' },
  rare: { sfx: 'revealRare', buzz: 'medium' },
  epic: { sfx: 'revealEpic', buzz: 'success' },
  legend: { sfx: 'revealLegend', buzz: 'heavy' },
};

export function revealFor(rarity: Rarity, reduced: boolean): Reveal {
  if (!reduced) return REVEALS[rarity];
  return { ...fadeReveal, rarity, cues: [{ at: fadeReveal.flipAt, ...FADE_CUE[rarity], stinger: true }] };
}

/** Every sound a reveal can play, the gentle fade's included: the page makes their players before the pack is torn. */
export const REVEAL_SOUNDS: readonly SfxName[] = [
  ...new Set([...Object.values(REVEALS).flatMap((r) => r.cues.flatMap((c) => (c.sfx ? [c.sfx] : []))), ...Object.values(FADE_CUE).map((c) => c.sfx)]),
];

export type { CardProps, Cue, Pulse, Reveal, StageProps } from './types';
