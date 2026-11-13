/** Fitting a player's name on one line of a card, worked out by hand so every platform agrees. */

/** average glyph width of the display font, as a share of the font size */
const GLYPH = 0.53;
/** the smallest a name may shrink to, as a share of its normal size */
export const MIN_FIT = 0.74;

/** endings that are not the family name: "Hank Dooley Jr." shortens to "Hank D.", not "Hank J." */
const SUFFIXES: readonly string[] = ['Jr.', 'Sr.', 'II', 'III', 'IV'];

/**
 * Shrink a little, and if that is not enough use "Wren K." for "Wren Kowalski",
 * then the player's short name if even that is too long.
 */
export function fitName(name: string, px: number, room: number, short?: string): { text: string; px: number } {
  const need = (t: string) => t.length * px * GLYPH;
  let text = name;
  if (need(text) * MIN_FIT > room) {
    const parts = name.split(' ').filter((part) => !SUFFIXES.includes(part));
    if (parts.length > 1) text = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    if (short !== undefined && need(text) * MIN_FIT > room) text = short;
  }
  const k = Math.min(1, room / need(text));
  return { text, px: Math.max(px * MIN_FIT, Math.floor(px * k)) };
}
