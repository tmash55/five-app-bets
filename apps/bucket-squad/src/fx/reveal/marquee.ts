/** Where a Legend's marquee bulbs sit. Plain arithmetic, apart from the drawing, so it can be tested. */

import type { EdgeInsets } from 'react-native-safe-area-context';

import { px } from '@/theme/tokens';

/**
 * Where the bulbs go: round the screen just inside its edge, clockwise from the top-left corner. On a phone
 * they keep inside the safe area, so none sits under the camera, in a rounded corner or on the home bar.
 */
export function bulbSpots(width: number, height: number, safe: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }): { x: number; y: number }[] {
  const inset = px(11);
  const pitch = px(25);
  const x0 = Math.max(inset, safe.left + px(4));
  const y0 = Math.max(inset, safe.top + px(4));
  const x1 = width - Math.max(inset, safe.right + px(4));
  const y1 = height - Math.max(inset, safe.bottom + px(4));
  const out: { x: number; y: number }[] = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / pitch));
    for (let i = 0; i < n; i++) out.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n });
  };
  side(x0, y0, x1, y0);
  side(x1, y0, x1, y1);
  side(x1, y1, x0, y1);
  side(x0, y1, x0, y0);
  return out;
}
