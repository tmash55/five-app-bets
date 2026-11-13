/**
 * Design tokens. Every colour, font, size and gap in the app comes from here,
 * so the whole game can be re-skinned in one place.
 *
 * The look: sunny playground sticker book. Thick ink outlines, chunky rounded
 * shapes, hard drop shadows, big friendly type.
 */

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

export const text = {
  tiny: 11,
  small: 13,
  body: 16,
  large: 20,
  title: 28,
  big: 40,
  huge: 64,
  giant: 96,
} as const;

export const space = {
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const stroke = {
  hair: 1,
  thin: 2,
  regular: 3,
  thick: 4,
} as const;

/** how far the hard "sticker" shadow sits under a raised shape */
export const lift = {
  low: 3,
  mid: 5,
  high: 8,
} as const;

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
  stick: 132,
  knob: 62,
  button: 92,
  buttonMid: 78,
  buttonSmall: 62,
  /** gap between the pad and the screen edge */
  inset: 22,
} as const;

/** fixed sizes of common pieces */
export const size = {
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
  /** a card's height for a width of 1 */
  cardRatio: 1.36,
  bar: 10,
  barThick: 16,
  panelMax: 560,
  scoreboard: 300,
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
