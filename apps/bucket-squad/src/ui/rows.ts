/**
 * Splits a list into rows of `columns`.
 *
 * Grids are laid out row by row instead of letting one row wrap: a wrapping row that is made to fit
 * exactly breaks one card early on phones whose pixels do not divide the sizes evenly.
 */
export function rowsOf<T>(items: readonly T[], columns: number): T[][] {
  const per = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));
  return rows;
}

/** How many things of a width fit side by side in a room, with a gap between them: at least one. */
export function columnsThatFit(room: number, width: number, gap: number): number {
  if (!(width > 0)) return 1;
  // half a point of slack: a size that fits on paper must not miss by a rounding error
  return Math.max(1, Math.floor((room + gap + 0.5) / (width + gap)));
}
