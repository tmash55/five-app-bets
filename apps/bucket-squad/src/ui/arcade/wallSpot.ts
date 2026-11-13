/**
 * Where a sign can hang on the wall behind a squad so the players' heads do not cover it: the biggest size that fits
 * the free wall above the heads, as far to one side as it can go. Only the sign's board has to be clear; what hangs
 * under it (a hoop's net) may go behind a head.
 */

export interface HeadSpot {
  /** the middle of the head, across */
  x: number;
  /** the top of the head at rest */
  top: number;
  /** half the head's width */
  half: number;
}

export interface SignShape {
  /** height for a width of 1 */
  ratio: number;
  /** the board's left and right edges, as shares of the sign's width */
  left: number;
  right: number;
  /** the board's bottom edge, as a share of the sign's height */
  bottom: number;
}

export interface WallRoom {
  /** the stretch of wall the sign may hang along: its left edge stays at or right of `from` and its right edge at or left of `to` */
  from: number;
  to: number;
  /** the heights the sign's top may hang at, the best first */
  tops: readonly number[];
  /** the widest and narrowest the sign may be, and the step between sizes tried */
  widest: number;
  least: number;
  step: number;
  /** the gap kept between the board and a head under it */
  clear: number;
}

export interface WallSpot {
  left: number;
  top: number;
  width: number;
}

/** The biggest, then leftmost, then highest-ranked place where the sign's board is clear of every head; null when there is none. */
export function wallSpot(heads: readonly HeadSpot[], sign: SignShape, room: WallRoom): WallSpot | null {
  const shift = Math.max(1, room.step);
  for (let width = room.widest; width >= room.least - 1e-6; width -= room.step) {
    const height = width * sign.ratio;
    for (let left = room.from; left + width <= room.to + 1e-6; left += shift) {
      const x0 = left + width * sign.left;
      const x1 = left + width * sign.right;
      for (const top of room.tops) {
        const bottom = top + height * sign.bottom;
        const clear = heads.every((h) => h.x + h.half <= x0 || h.x - h.half >= x1 || bottom + room.clear <= h.top);
        if (clear) return { left, top, width };
      }
    }
  }
  return null;
}
