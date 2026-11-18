/**
 * Where everything goes on the pack opening page, worked out from the screen in one place: the stage's own
 * pieces move between these points (a card from its place in the row to the middle and over to the side),
 * so they have to be known as numbers, not left to a layout pass.
 *
 * Up and down it is the mockup's 844 x 390 design, scaled; a taller screen centres it. Across, the card's
 * side and the side that tells about the player share whatever width there is.
 */

import { px, size as sizes } from '@/theme/tokens';

export interface Point {
  x: number;
  y: number;
}

export interface OpenLayout {
  screen: { width: number; height: number };
  /** the gaps kept at each edge, the phone's own insets included */
  edge: { left: number; right: number; top: number; bottom: number };
  /** the design's height on this screen, and where it starts */
  frame: { top: number; height: number };
  card: { width: number; height: number };
  /** where a revealed card rests, beside what it says (its middle) */
  rest: Point;
  /** where the reveal plays (its middle) */
  middle: Point;
  /** the row of places under the card, one per card in the pack (their middles) */
  slots: Point[];
  slot: { width: number; height: number };
  /** the side that tells about the player */
  info: { left: number; top: number; width: number; height: number };
  /** the sealed pack (its middle) and its width */
  pack: Point & { width: number };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** the design's own sizes, scaled to the screen by `px` */
const D = {
  height: 390,
  card: 184,
  /** above the card, below the card and the row, and the row itself */
  cardTop: 50,
  rowBottom: 18,
  slotW: 30,
  slotH: 40,
  slotGap: 9,
  /** room the card needs above and below it */
  cardRoom: 136,
  infoGap: 22,
  infoTop: 26,
  infoBottom: 18,
  infoMost: 400,
  pack: 150,
  packY: 182,
  edgeX: 18,
  edgeRight: 20,
  edgeY: 12,
} as const;

/** how much of the width the card's side takes, at most, and where in it the card sits */
const CARD_SIDE = 0.5;
const CARD_SIDE_WIDTH = 2.22;
const CARD_AT = 0.54;

export function openLayout(width: number, height: number, insets: Insets, cards: number): OpenLayout {
  const edge = { left: Math.max(insets.left, px(D.edgeX)), right: Math.max(insets.right, px(D.edgeRight)), top: Math.max(insets.top, px(D.edgeY)), bottom: Math.max(insets.bottom, px(D.edgeY)) };
  const frameH = Math.min(height, px(D.height));
  const frameTop = Math.max(0, (height - frameH) / 2);
  const cardW = Math.max(px(100), Math.min(px(D.card), Math.floor((frameH - px(D.cardRoom)) / sizes.cardRatio)));
  const cardH = Math.round(cardW * sizes.cardRatio);
  const across = width - edge.left - edge.right;
  const side = Math.min(cardW * CARD_SIDE_WIDTH, across * CARD_SIDE);
  const restX = edge.left + side * CARD_AT;
  const cardY = frameTop + px(D.cardTop) + cardH / 2;
  const slot = { width: px(D.slotW), height: px(D.slotH) };
  const slotY = frameTop + frameH - px(D.rowBottom) - slot.height / 2;
  const n = Math.max(1, cards);
  const rowW = n * slot.width + (n - 1) * px(D.slotGap);
  const slots = Array.from({ length: n }, (_, i) => ({ x: restX - rowW / 2 + slot.width / 2 + i * (slot.width + px(D.slotGap)), y: slotY }));
  const infoLeft = edge.left + side + px(D.infoGap);
  const infoTop = frameTop + px(D.infoTop);
  return {
    screen: { width, height },
    edge,
    frame: { top: frameTop, height: frameH },
    card: { width: cardW, height: cardH },
    rest: { x: restX, y: cardY },
    middle: { x: width / 2, y: cardY },
    slots,
    slot,
    info: { left: infoLeft, top: infoTop, width: Math.min(px(D.infoMost), width - edge.right - infoLeft), height: frameTop + frameH - px(D.infoBottom) - infoTop },
    pack: { x: width / 2, y: frameTop + px(D.packY), width: px(D.pack) },
  };
}
