/**
 * Design tokens. Every colour, font, size and gap in the app comes from here,
 * so the whole game can be re-skinned in one place.
 *
 * The look: sunny playground sticker book. Thick ink outlines, chunky rounded
 * shapes, hard drop shadows, big friendly type.
 *
 * Sizes are written for one screen (a current phone held sideways) and scaled
 * to the screen the game is running on, the way a game scales its HUD: a small
 * phone gets the same layout a little smaller, a tablet gets it bigger.
 */

import { Dimensions, PixelRatio } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/** the screen every size below is written for */
export const design = { width: 844, height: 390 } as const;
/** the gaps every screen keeps at its edges anyway (ui/Screen), on the design screen: at the ends of its long side, and of its short side */
const EDGE_LONG = 16;
const EDGE_SHORT = 8;

/** the whole look never gets smaller or bigger than this, whatever the screen */
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.7;
/** thumbs do not shrink or grow with the screen, so the game pad follows it only part of the way */
const PAD_SCALE_MIN = 0.9;
const PAD_SCALE_MAX = 1.25;

/** How much bigger or smaller than the design screen a screen is, either way up. */
export function scaleFor(width: number, height: number): number {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (!(short > 0)) return 1;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, long / design.width, short / design.height));
}

export interface ScreenEdges {
  frame: { width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
}

/**
 * The screen as the layouts get it. A camera island, a notch or a home bar takes room at an edge. Every screen keeps
 * a gap at its edges anyway, so only what they take beyond that gap is lost. The layouts are drawn and checked for
 * plain screens: this hands them the plain screen with the same room, so a phone with an island gets a layout that
 * was checked instead of one squeezed into less room than it was made for.
 */
export function usableScreen(width: number, height: number, edges: ScreenEdges | null | undefined): { long: number; short: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (!edges || !(short > 0)) return { long, short };
  // the insets belong to the frame they were measured with, whichever way up that was
  const tall = edges.frame.height > edges.frame.width;
  const i = edges.insets;
  const ends = tall ? [i.top, i.bottom] : [i.left, i.right];
  const sides = tall ? [i.left, i.right] : [i.top, i.bottom];
  let out = { long, short };
  // the gap grows with the scale and the scale with the room, so go round a few times: it settles at once
  for (let n = 0; n < 4; n++) {
    const k = scaleFor(out.long, out.short);
    const lost = (taken: number[], gap: number) => taken.reduce((sum, v) => sum + Math.max(0, (v > 0 ? v : 0) - gap * k), 0);
    out = { long: Math.max(1, long - lost(ends, EDGE_LONG)), short: Math.max(1, short - lost(sides, EDGE_SHORT)) };
  }
  return out;
}

const screen = Dimensions.get('window');
const usable = usableScreen(screen.width, screen.height, initialWindowMetrics);
/**
 * This screen's scale. Worked out once, as the app starts: the game is locked
 * to landscape and fills the screen, so it does not change while it runs.
 */
export const uiScale = scaleFor(usable.long, usable.short);
/** the game pad follows the size of the screen itself: an island takes room from the menus, not from the thumbs */
const padScale = Math.max(PAD_SCALE_MIN, Math.min(PAD_SCALE_MAX, scaleFor(screen.width, screen.height)));

/** A design size on this screen, snapped to whole pixels. For the few sizes that are not tokens. */
export function px(n: number): number {
  return PixelRatio.roundToNearestPixel(n * uiScale);
}

type Sized<T> = { readonly [K in keyof T]: number };

function sized<T extends Record<string, number>>(at: T, k: number = uiScale, least = 0): Sized<T> {
  const out = {} as { [K in keyof T]: number };
  for (const key of Object.keys(at) as (keyof T)[]) out[key] = Math.max(least, PixelRatio.roundToNearestPixel(at[key] * k));
  return out;
}

export const color = {
  // ink and paper
  ink: '#1B1F3B',
  inkSoft: '#3B4270',
  inkFaint: '#7C84B0',
  paper: '#FFF8E7',
  paperDim: '#F1E6C8',
  white: '#FFFFFF',
  // brand
  sky: '#2B7FFF',
  skyLight: '#58C4FF',
  skyDeep: '#1B56D6',
  sun: '#FFD23F',
  sunDeep: '#F2A21B',
  coral: '#FF5D5D',
  coralDeep: '#D43D4C',
  mint: '#3DDC97',
  mintDeep: '#1FA872',
  grape: '#9B6BFF',
  grapeDeep: '#6C3FD1',
  orange: '#FF8A3D',
  orangeDeep: '#E0621B',
  pink: '#FF8FD0',
  // feedback in a match
  perfect: '#3DDC97',
  good: '#FFD23F',
  okay: '#FF9F43',
  bad: '#FF5D5D',
  // card rarities
  common: '#9AA5B8',
  commonDeep: '#6F7B91',
  rare: '#3FA9F5',
  rareDeep: '#1F78C8',
  epic: '#B266FF',
  epicDeep: '#7F35D6',
  legend: '#FFB800',
  legendDeep: '#E07B00',
  // overlays
  scrim: 'rgba(27, 31, 59, 0.62)',
  scrimSoft: 'rgba(27, 31, 59, 0.28)',
  glass: 'rgba(255, 255, 255, 0.2)',
  glassStrong: 'rgba(255, 255, 255, 0.34)',
  clear: 'rgba(255, 255, 255, 0)',
} as const;

export type ColorName = keyof typeof color;

export const font = {
  /** headings, numbers, buttons */
  display: 'LilitaOne_400Regular',
  body: 'Fredoka_500Medium',
  bodyBold: 'Fredoka_700Bold',
} as const;

export const text = sized({
  tiny: 11,
  small: 13,
  body: 16,
  large: 20,
  title: 28,
  big: 40,
  huge: 64,
  giant: 96,
});

export const space = sized({
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
});

export const radius = {
  ...sized({
    sm: 8,
    md: 14,
    lg: 22,
    xl: 30,
  }),
  /** more than half of anything: fully round ends */
  pill: 999,
} as const;

export const stroke = sized(
  {
    hair: 1,
    thin: 2,
    regular: 3,
    thick: 4,
  },
  uiScale,
  1,
);

/** how far the hard "sticker" shadow sits under a raised shape */
export const lift = sized({
  low: 3,
  mid: 5,
  high: 8,
});

export const duration = {
  quick: 120,
  normal: 220,
  slow: 420,
  pop: 650,
  callout: 1300,
  reveal: 900,
} as const;

/** sizes of the on-screen game pad */
export const pad = {
  ...sized(
    {
      stick: 132,
      knob: 62,
      button: 92,
      buttonMid: 78,
      buttonSmall: 62,
      /** gap between the pad and the screen edge */
      inset: 22,
      /** lettering on the big, middle and small buttons */
      label: 16,
      labelMid: 13,
      labelSmall: 11,
    },
    padScale,
  ),
  /** one design pixel of pad layout on this screen */
  unit: padScale,
} as const;

/** fixed sizes of common pieces */
export const size = {
  ...sized({
    iconTiny: 14,
    iconSmall: 18,
    icon: 24,
    iconLarge: 32,
    iconHuge: 48,
    /** shortest side of anything you can tap */
    tap: 44,
    buttonSmall: 40,
    button: 52,
    buttonLarge: 68,
    avatarSmall: 36,
    avatar: 48,
    avatarLarge: 72,
    badgeTiny: 20,
    badgeSmall: 28,
    badge: 44,
    badgeLarge: 64,
    /** level dots on a card, smallest card first */
    pipTiny: 5,
    pipSmall: 6,
    pip: 8,
    pipLarge: 10,
    cardSmall: 96,
    card: 128,
    cardLarge: 190,
    bar: 10,
    barThick: 16,
    panelMax: 560,
    scoreboard: 300,
  }),
  /** a card's height for a width of 1 */
  cardRatio: 1.36,
} as const;

export const opacity = {
  ghost: 0.35,
  dim: 0.55,
  soft: 0.8,
  pattern: 0.1,
} as const;

/** stacking order inside a screen */
export const layer = {
  base: 0,
  hud: 10,
  pad: 20,
  /** buttons that must stay tappable above the game pad */
  menu: 25,
  callout: 30,
  overlay: 40,
  modal: 50,
} as const;

/** palette used for confetti and sparkles in a match */
export const party = ['#FF5D5D', '#FFD23F', '#3DDC97', '#3FA9F5', '#B388FF', '#FF8FD0', '#FFFFFF'] as const;
export const sparkle = ['#FFFFFF', '#FFE66D', '#FFD23F'] as const;
/** a player on a hot streak (their ring of light on the court, their glow, the trail of their shots): white-hot, gold, orange, hot pink */
export const hot = ['#FFF6D6', '#FFD23F', '#FF8A3D', '#FF4FA0'] as const;
