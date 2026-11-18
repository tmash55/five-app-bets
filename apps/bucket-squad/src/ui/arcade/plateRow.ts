/**
 * Name plates in a row under figures that stand close together: each plate stays under its own figure, the outer
 * ones may lean outward a little to make room, and only when that is not enough do the widest plates get narrower
 * (their names then shorten to fit).
 */

export interface PlateSpot {
  /** where the plate's figure stands, across */
  at: number;
  /** how wide the plate would like to be */
  width: number;
}

export interface PlacedPlate {
  /** the plate's middle, across */
  x: number;
  width: number;
}

/** how far a plate may slide off its figure, as a share of its width: the figure stays well over the plate */
const LEAN = 0.3;
/** each round of narrowing takes this much off the widest plates */
const NARROW = 0.96;

/** The leftmost and rightmost places each plate can take with these widths, or null when they cannot all fit. */
function bounds(spots: readonly PlateSpot[], widths: readonly number[], left: number, right: number, gap: number): { lo: number[]; hi: number[] } | null {
  const n = spots.length;
  const lo: number[] = [];
  const hi: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const own = spots[i].at - LEAN * widths[i];
    const edge = i === 0 ? left + widths[i] / 2 : lo[i - 1] + (widths[i - 1] + widths[i]) / 2 + gap;
    lo.push(Math.max(own, edge));
    if (lo[i] > spots[i].at + LEAN * widths[i] + 1e-6) return null;
  }
  for (let i = n - 1; i >= 0; i--) {
    const own = spots[i].at + LEAN * widths[i];
    const edge = i === n - 1 ? right - widths[i] / 2 : hi[i + 1] - (widths[i + 1] + widths[i]) / 2 - gap;
    hi[i] = Math.min(own, edge);
    if (hi[i] < lo[i] - 1e-6) return null;
  }
  return { lo, hi };
}

/**
 * Places plates for figures standing at `spots` (in order across) between `left` and `right`, `gap` apart.
 * Each plate is as close to the middle of its figure as there is room for.
 */
export function placePlates(spots: readonly PlateSpot[], left: number, right: number, gap: number): PlacedPlate[] {
  if (spots.length === 0) return [];
  let cap = Math.max(...spots.map((s) => s.width));
  // narrow the widest plates until the row fits; a plate never gets narrower than a few letters
  const least = cap * 0.35;
  let widths = spots.map((s) => Math.min(s.width, cap));
  let room = bounds(spots, widths, left, right, gap);
  while (room === null && cap > least) {
    cap *= NARROW;
    widths = spots.map((s) => Math.min(s.width, cap));
    room = bounds(spots, widths, left, right, gap);
  }
  if (room === null) return spots.map((s, i) => ({ x: s.at, width: widths[i] }));
  const { lo, hi } = room;
  const clamp = (i: number, v: number) => Math.min(hi[i], Math.max(lo[i], v));
  const xs = spots.map((s, i) => clamp(i, s.at));
  // two plates that touch push each other apart evenly, so a crowded middle plate stays under its figure
  for (let round = 0; round < 60; round++) {
    let moved = false;
    for (let i = 0; i + 1 < xs.length; i++) {
      const over = (widths[i] + widths[i + 1]) / 2 + gap - (xs[i + 1] - xs[i]);
      if (over <= 1e-6) continue;
      xs[i] = clamp(i, xs[i] - over / 2);
      xs[i + 1] = clamp(i + 1, xs[i + 1] + over / 2);
      moved = true;
    }
    if (!moved) break;
  }
  // whatever is left over after the even pushes goes to the right, where the bounds say there is room
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + (widths[i - 1] + widths[i]) / 2 + gap);
  return xs.map((x, i) => ({ x, width: widths[i] }));
}
