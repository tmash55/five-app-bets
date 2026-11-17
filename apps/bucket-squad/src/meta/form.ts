/**
 * How the person has been doing against the computer lately, kept hidden in the save: their "form", from -1 (losing
 * by a lot, game after game) to 1 (winning easily, game after game). A new save, and a save from before form, starts
 * at 0.
 *
 * Before each game against the computer (a quick game, a tour stop, a ladder game) the form turns into a small nudge
 * to the computer's skill for that one game (`MatchSetup.ease`): a few losses in a row ease the next games a little,
 * a run of easy wins firms them up a little. The nudge is worked out once, before the game starts, and never changes
 * during it. It stays inside a band around the level picked, so Rookie stays easy and All-Star stays hard, and the
 * level the game is shown, rewarded and scored at is always the one picked. Two-player games never move it.
 */

export const FORM = {
  /** how much of the form a new game replaces (the rest is the games before) */
  weight: 0.3,
  /** a game won or lost by this many points or more counts in full */
  margin: 12,
  /** the most the computer's skill comes down at the worst form (-1), and goes up at the best (1) */
  easeDown: 0.12,
  firmUp: 0.08,
} as const;

/** One game's worth to the form, -1..1: by how much it was won or lost. A close game hardly counts either way. */
export function gameForm(margin: number): number {
  return Math.max(-1, Math.min(1, margin / FORM.margin));
}

/** The form after a game against the computer won or lost by `margin` (the person's score less the computer's). */
export function formAfter(form: number, margin: number): number {
  const before = Number.isFinite(form) ? Math.max(-1, Math.min(1, form)) : 0;
  const next = before * (1 - FORM.weight) + gameForm(margin) * FORM.weight;
  // kept to a few decimals, so the save stays tidy
  return Math.round(next * 1000) / 1000;
}

/**
 * The nudge to the computer's skill for the next game: down a little after losses, up a little after easy wins,
 * never past the band, and never below 0 or above 1 for the skill itself.
 */
export function easeFor(form: number | undefined, difficulty: number): number {
  const f = typeof form === 'number' && Number.isFinite(form) ? Math.max(-1, Math.min(1, form)) : 0;
  const want = f < 0 ? f * FORM.easeDown : f * FORM.firmUp;
  const skill = Math.max(0, Math.min(1, difficulty + want));
  return Math.round((skill - difficulty) * 1000) / 1000;
}

/** A form read from a save: a number in range, or 0. */
export function repairForm(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}
