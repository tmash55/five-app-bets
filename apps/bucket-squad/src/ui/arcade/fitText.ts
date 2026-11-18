/**
 * Lettering that never gets cut off with dots: pick the wording that fits, shrink it to a floor, and when even that
 * is too wide, break it over two lines. Everything is measured with the kit's `widthOf`, with a little room to spare,
 * because a line that only just fits on one screen is cut on the next one's rounding.
 */

import { track as tracks, type NeonFace } from '@/theme/arcade';
import type { TrackName } from './Type';
import { MIN_FIT, widthOf } from './measure';

/** the share of the room a line may fill: what is left over takes up rounding from one screen to the next */
export const SPARE = 0.97;

function gapOf(t: TrackName | number): number {
  return typeof t === 'number' ? t : tracks[t];
}

/** Whether `t` fits in `room` at this size, with the room to spare. */
export function fits(t: string, face: NeonFace, size: number, room: number, track: TrackName | number = 'none'): boolean {
  return widthOf(t, face, size, gapOf(track)) <= room * SPARE;
}

/** The first wording that fits on one line at its full size, or the last (the shortest) when none does. */
export function firstThatFits(choices: readonly string[], face: NeonFace, size: number, room: number, track: TrackName | number = 'none'): string {
  return choices.find((t) => fits(t, face, size, room, track)) ?? choices[choices.length - 1];
}

export interface FittedText {
  /** the text to print: with a line break in it when it takes two lines */
  text: string;
  size: number;
  lines: 1 | 2;
}

/**
 * `t` at its own size when it fits, shrunk no further than `least` when that is enough, and otherwise over two lines
 * broken at the space that makes the longer line shortest, shrunk (no further than `least`) until that line fits.
 * Print the result without a line limit: in the worst case it wraps, it is never cut.
 */
export function fitText(t: string, face: NeonFace, size: number, room: number, track: TrackName | number = 'none', least = MIN_FIT): FittedText {
  const gap = gapOf(track);
  const roomy = room * SPARE;
  // letter spacing grows with the lettering, so it is measured at the size tried
  const wide = (s: string, at: number) => widthOf(s, face, at, (gap * at) / size);
  const one = wide(t, size);
  if (one <= roomy) return { text: t, size, lines: 1 };
  const shrunk = Math.floor(size * (roomy / one) * 10) / 10;
  if (shrunk >= size * least) return { text: t, size: shrunk, lines: 1 };
  const words = t.split(' ');
  if (words.length < 2) return { text: t, size: Math.max(size * least, shrunk), lines: 1 };
  let best = { text: t, widest: Infinity };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const widest = Math.max(wide(a, size), wide(b, size));
    if (widest < best.widest) best = { text: `${a}\n${b}`, widest };
  }
  const at = best.widest <= roomy ? size : Math.max(size * least, Math.floor(size * (roomy / best.widest) * 10) / 10);
  return { text: best.text, size: at, lines: 2 };
}
