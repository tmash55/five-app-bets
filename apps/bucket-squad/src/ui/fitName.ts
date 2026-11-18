/** Fitting a player's name on one line of a card, worked out by hand so every platform agrees. */

/**
 * How wide each printable ASCII character is in the display font (Lilita One), in thousandths of the
 * font size, from space to tilde. Measured from the font file, so a name is measured as it will be drawn.
 */
const ADVANCE: readonly number[] = [
  188, 287, 460, 833, 531, 798, 667, 301, 430, 422, 557, 602, 305, 525, 229, 573, 639, 406, 525, 528, 598, 524, 575, 500, 570, 565, 277, 277, 484, 580, 450, 584, 867, 655, 594, 561, 616, 493, 472, 621, 644, 429, 462, 620, 435, 907, 648,
  696, 570, 706, 590, 531, 502, 628, 661, 953, 683, 615, 563, 385, 587, 385, 687, 636, 350, 517, 520, 424, 565, 486, 375, 516, 501, 273, 271, 531, 272, 788, 551, 513, 555, 511, 396, 450, 368, 544, 521, 752, 557, 537, 454, 362, 628, 362, 459,
];
/** first character in the table (space) */
const FIRST = 32;
/** a character the table does not have (an accented letter), measured on the wide side */
const WIDE = 0.6;
/** kerning can make a word a little wider than its letters added up */
const SLACK = 1.03;
/** the smallest a name may shrink to, as a share of its normal size */
export const MIN_FIT = 0.74;

/** endings that are not the family name: "Hank Dooley Jr." shortens to "Hank D.", not "Hank J." */
const SUFFIXES: readonly string[] = ['Jr.', 'Sr.', 'II', 'III', 'IV'];

/** How wide a line of display text is at a font size. */
export function textWidth(t: string, px: number): number {
  let em = 0;
  for (let i = 0; i < t.length; i++) em += ADVANCE[t.charCodeAt(i) - FIRST] ?? WIDE * 1000;
  return (em / 1000) * px * SLACK;
}

/** a short label that is lettering rather than reading (a pack's name strip) may shrink this far */
export const MIN_FIT_LABEL = 0.6;

/** The font size that fits a line of display text in `room`: its own size when it fits, shrunk a little when not, never below the floor. */
export function fitSize(t: string, px: number, room: number, least = MIN_FIT): number {
  const k = Math.min(1, room / textWidth(t, px));
  return Math.max(px * least, Math.floor(px * k));
}

/**
 * Shrink a little, and if that is not enough use "Wren K." for "Wren Kowalski",
 * then the player's short name if even that is too long.
 */
export function fitName(name: string, px: number, room: number, short?: string): { text: string; px: number } {
  const fits = (t: string) => textWidth(t, px) * MIN_FIT <= room;
  let text = name;
  if (!fits(text)) {
    const parts = name.split(' ').filter((part) => !SUFFIXES.includes(part));
    if (parts.length > 1) text = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    if (short !== undefined && !fits(text)) text = short;
  }
  return { text, px: fitSize(text, px, room) };
}
