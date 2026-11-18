/**
 * How wide a line of arcade lettering is, worked out by hand so every platform agrees
 * (the same idea as ui/fitName, which does it for the match's font).
 */

import type { NeonFace } from '@/theme/arcade';

/**
 * How wide each printable ASCII character is in each face, in thousandths of the font size,
 * from space to tilde. Measured from the font files, so a line is measured as it will be drawn.
 */
const ADVANCE: Record<NeonFace, readonly number[]> = {
  display: [
    225, 424, 646, 750, 650, 1031, 766, 356, 429, 429, 718, 734, 384, 420, 384, 347, 727, 601, 639, 637, 709, 647, 693, 627, 711, 693, 384, 384, 714, 734, 714, 656, 867, 730, 725, 628, 746, 654, 618, 708, 759, 605, 688, 746, 695, 849, 753,
    737, 682, 737, 743, 650, 656, 746, 730, 831, 737, 705, 660, 429, 347, 429, 714, 734, 500, 730, 725, 628, 746, 654, 618, 708, 759, 605, 688, 746, 695, 849, 753, 737, 682, 737, 743, 650, 656, 746, 730, 831, 737, 705, 660, 455, 347, 455, 734,
  ],
  sign: [
    215, 261, 496, 700, 500, 1023, 634, 297, 452, 452, 614, 540, 269, 340, 260, 490, 592, 344, 505, 488, 525, 501, 534, 483, 535, 534, 260, 279, 447, 490, 447, 511, 956, 651, 540, 600, 660, 523, 503, 653, 688, 270, 448, 591, 498, 808, 688,
    732, 555, 732, 595, 521, 498, 668, 620, 888, 617, 582, 595, 430, 490, 430, 560, 535, 500, 584, 584, 475, 584, 548, 364, 556, 568, 231, 245, 501, 231, 828, 568, 577, 584, 584, 389, 462, 336, 568, 489, 725, 499, 488, 474, 466, 315, 466, 639,
  ],
  bold: [
    272, 274, 460, 717, 637, 875, 662, 256, 348, 348, 349, 564, 238, 432, 238, 522, 652, 382, 574, 603, 579, 606, 622, 522, 638, 627, 232, 232, 614, 564, 614, 562, 835, 646, 670, 655, 688, 606, 576, 676, 698, 276, 580, 651, 561, 801, 697,
    700, 646, 700, 675, 637, 584, 700, 650, 879, 652, 634, 592, 344, 537, 344, 657, 482, 240, 575, 600, 558, 602, 583, 400, 602, 594, 272, 287, 567, 262, 861, 592, 592, 602, 595, 409, 536, 414, 591, 510, 729, 528, 593, 498, 377, 264, 377, 586,
  ],
  body: [
    263, 264, 420, 707, 629, 859, 654, 236, 335, 335, 346, 556, 227, 422, 227, 503, 644, 374, 566, 595, 571, 598, 614, 514, 630, 619, 223, 223, 606, 556, 606, 552, 827, 637, 662, 647, 680, 598, 568, 668, 690, 266, 572, 640, 553, 793, 689,
    692, 638, 692, 667, 629, 576, 692, 642, 874, 636, 620, 584, 332, 518, 332, 650, 462, 240, 567, 593, 550, 595, 576, 392, 595, 586, 263, 278, 553, 253, 853, 584, 585, 595, 588, 401, 528, 406, 583, 501, 722, 515, 585, 490, 366, 254, 366, 578,
  ],
  medium: [
    253, 254, 380, 697, 621, 842, 646, 216, 322, 322, 343, 548, 217, 412, 217, 484, 636, 366, 558, 587, 563, 590, 606, 506, 622, 611, 215, 215, 598, 548, 598, 542, 819, 629, 654, 639, 672, 590, 560, 660, 682, 256, 564, 628, 545, 785, 681,
    684, 630, 684, 659, 621, 568, 684, 634, 868, 620, 606, 576, 321, 499, 321, 643, 442, 240, 559, 585, 542, 587, 568, 384, 587, 578, 253, 268, 538, 243, 845, 576, 577, 587, 580, 393, 520, 398, 575, 491, 714, 501, 577, 482, 355, 244, 355, 570,
  ],
};

/** first character in the tables (space) */
const FIRST = 32;
/** the few marks outside ASCII the game prints, in thousandths (close enough to fit a line by) */
const EXTRA: Record<string, number> = { '·': 280, '’': 260, '‘': 260, '“': 440, '”': 440, '…': 800, '–': 520, '—': 820, '×': 560, '→': 800, '•': 380 };
/** a character neither table has (an accented letter), measured on the wide side */
const WIDE = 720;
/** kerning and rounding can make a word a little wider than its letters added up */
const SLACK = 1.03;

/** the smallest a line may shrink to, as a share of its normal size */
export const MIN_FIT = 0.7;
/** a short label that is lettering rather than reading may shrink this far */
export const MIN_FIT_LABEL = 0.56;

/** How wide one line is at a font size, with `gap` between its letters. */
export function widthOf(t: string, face: NeonFace, size: number, gap = 0): number {
  const table = ADVANCE[face];
  let em = 0;
  for (const ch of t) em += table[ch.charCodeAt(0) - FIRST] ?? EXTRA[ch] ?? WIDE;
  // every letter is followed by its gap, the last one too
  return (em / 1000) * size * SLACK + t.length * gap;
}

/** The font size that fits a line in `room`: its own size when it fits, shrunk when it does not, never below the floor. */
export function fitTo(t: string, face: NeonFace, size: number, room: number, gap = 0, least = MIN_FIT): number {
  const wide = widthOf(t, face, size, gap);
  if (!(wide > room)) return size;
  return Math.max(size * least, Math.floor(size * (room / wide) * 10) / 10);
}

/** endings that are not the family name: "Hank Dooley Jr." shortens to "Hank D.", not "Hank J." */
const SUFFIXES: readonly string[] = ['Jr.', 'Sr.', 'II', 'III', 'IV'];

/**
 * A player's name on one line: shrink a little, and if that is not enough use "Wren K." for
 * "Wren Kowalski", then the player's short name if even that is too long.
 */
export function fitPerson(name: string, face: NeonFace, size: number, room: number, gap = 0, short?: string, least = MIN_FIT): { text: string; size: number } {
  const fits = (t: string) => widthOf(t, face, size * least, gap * least) <= room;
  let text = name;
  if (!fits(text)) {
    const parts = name.split(' ').filter((part) => !SUFFIXES.includes(part));
    if (parts.length > 1) text = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    if (short !== undefined && !fits(text)) text = short;
  }
  return { text, size: fitTo(text, face, size, room, gap, least) };
}
