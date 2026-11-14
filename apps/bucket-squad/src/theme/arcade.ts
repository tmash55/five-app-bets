/**
 * Arcade Night: the look of every menu page. A dark room, neon tubes,
 * scoreboard lettering and one big yellow button.
 *
 * The match keeps the sticker look in `tokens.ts`. Gaps and the screen scale
 * are shared with it, so both looks grow with the screen the same way.
 */

import type { BoxShadowValue } from 'react-native';

import type { Rarity } from '@/data/types';
import { px, uiScale } from './tokens';

/** The room, and everything in it that does not glow. */
export const night = {
  wallTop: '#0D0A22',
  wallMid: '#1A1347',
  wallBottom: '#23175C',
  /** the diamond lattice on the wall */
  lattice: 'rgba(255, 255, 255, 0.04)',
  /** the strip along the top of every page */
  bar: '#090719',
  floorTop: '#2B1C73',
  floorBottom: '#150F3C',
  /** the stage a pack is opened on: middle, half way out, edge */
  stageMid: '#2A1466',
  stageOut: '#150E3A',
  stageEdge: '#0A0719',
  // boxes, lightest first: a panel, a tile, a name plate, a row inside a panel, a chip
  panel: '#100C2C',
  tile: '#0E0B26',
  plate: '#0B0920',
  well: '#07061A',
  pit: '#05040F',
  /** quiet outlines and unlit lamps */
  line: '#2C2466',
  lineLit: '#5A5390',
  // lettering, brightest first
  text: '#FFFFFF',
  textSoft: '#E1DEF5',
  textMuted: '#D9D5F2',
  textDim: '#C9C5E8',
  textFaint: '#9A94D4',
  /** lettering on something lit: the yellow button, a filled badge */
  onLight: '#1A1347',
  onTube: '#0D0A22',
  /** over the page while something pops up, and behind lettering that sits on a picture */
  scrim: 'rgba(5, 4, 15, 0.78)',
  shade: 'rgba(13, 10, 34, 0.9)',
  black: '#000000',
  white: '#FFFFFF',
  clear: 'rgba(13, 10, 34, 0)',
  /** a spotlight's beam, at the lamp and where it lands */
  beam: 'rgba(196, 178, 255, 0.42)',
  beamFar: 'rgba(196, 178, 255, 0.07)',
} as const;

export type NightName = keyof typeof night;

/** A neon tube. */
export interface Tube {
  /** the gas itself: outlines, glows, filled badges */
  glass: string;
  /** the near-white lettering it lights */
  tint: string;
  /** a softer line, for icons and small print */
  soft: string;
}

export const tube = {
  pink: { glass: '#FF3DA5', tint: '#FFE3F2', soft: '#FF8CCB' },
  cyan: { glass: '#2DE2E6', tint: '#E2FDFF', soft: '#9BF6F8' },
  green: { glass: '#5CFF9D', tint: '#E6FFF0', soft: '#B4FFD2' },
  violet: { glass: '#B58CFF', tint: '#F1E8FF', soft: '#D9C5FF' },
  gold: { glass: '#FFE14A', tint: '#FFFAD0', soft: '#FFF07A' },
  indigo: { glass: '#7B6CFF', tint: '#E4E8FF', soft: '#B9C4FF' },
  orange: { glass: '#FF9A57', tint: '#FFEBDD', soft: '#FFC49C' },
  red: { glass: '#FF5468', tint: '#FFE4E8', soft: '#FF9AA7' },
  white: { glass: '#FFFFFF', tint: '#FFFFFF', soft: '#E8ECF5' },
  // the four rarities
  steel: { glass: '#9AA5B8', tint: '#E8ECF5', soft: '#C3CAD8' },
  blue: { glass: '#3FA9F5', tint: '#E5F4FF', soft: '#6CC0FA' },
  purple: { glass: '#B266FF', tint: '#F4E9FF', soft: '#CB98FF' },
  amber: { glass: '#FFB800', tint: '#FFF6C2', soft: '#FFD76A' },
} as const satisfies Record<string, Tube>;

export type TubeName = keyof typeof tube;

/** A tube by name, or one made for the occasion (a team's colour). */
export function tubeOf(t: TubeName | Tube): Tube {
  return typeof t === 'string' ? tube[t] : t;
}

/** How a rarity is painted. */
export interface RarityPaint {
  tube: TubeName;
  /** a card's rim, from one corner to the other */
  rim: readonly [string, string, string, string, string];
  /** behind the player on a card: middle, half way out, edge */
  halo: readonly [string, string, string];
  /** behind a face in the collection grid */
  cell: string;
  /** gems to count, for anyone who cannot read the word yet */
  gems: number;
}

/** where the five colours of a rim sit along it */
export const RIM_STOPS = [0, 0.22, 0.48, 0.74, 1] as const;

export const rarityPaint: Record<Rarity, RarityPaint> = {
  common: { tube: 'steel', rim: ['#F4F6FA', '#9AA5B8', '#DCE2EC', '#6F7B91', '#B4BECE'], halo: ['#C7CFDD', '#59627A', '#1A1D3A'], cell: '#59627A', gems: 1 },
  rare: { tube: 'blue', rim: ['#D5ECFF', '#3FA9F5', '#2DE2E6', '#5B8DFF', '#3FA9F5'], halo: ['#8FD0FF', '#1F5FA8', '#12104A'], cell: '#2C6FB5', gems: 2 },
  epic: { tube: 'purple', rim: ['#E2C8FF', '#B266FF', '#FF3DA5', '#2DE2E6', '#B266FF'], halo: ['#D9B8FF', '#8E46E6', '#2E1470'], cell: '#6B34B8', gems: 3 },
  legend: { tube: 'amber', rim: ['#FFF6C2', '#FFB800', '#FF3DA5', '#FFE14A', '#FF8A00'], halo: ['#FFE9A8', '#D9930A', '#4A2400'], cell: '#A8720A', gems: 4 },
};

/**
 * How a player's level is drawn. The rarity stays the card's colour (its rim, its light, its gems); the level is
 * the frame round it, and every level adds a piece: a neon trim, lit corner studs, a chrome edge, and at the top
 * level a gold edge and a crest. Gold is the level's colour everywhere: its lamps, and the rating lamps a player
 * gained by levelling up.
 */
export const levelPaint = {
  /** the level's lamps, the rating lamps it lit, and the next level's dim outlines */
  tube: 'gold' as TubeName,
  /** the neon line inside the rim: a white-hot core in the rarity's own glow */
  trim: tube.white.glass,
  /** a lit stud in each corner: its glass and its hot middle */
  stud: tube.gold.glass,
  studCore: tube.gold.tint,
  /** the chrome edge round the card, corner to corner */
  chrome: ['#FFFFFF', '#8E98AE', '#F2F5FA', '#5E677C', '#E6EAF2'],
  /** at the top level the edge turns to gold */
  goldChrome: ['#FFFAD0', '#FFB800', '#FFF07A', '#B87A00', '#FFE14A'],
  /** the crest on top: its plate, from top to bottom, and the crown on it */
  crest: ['#FFF6C2', '#FFD23F', '#E89B00'],
  crestInk: night.onTube,
} as const;

/** where the five colours of a chrome edge sit along it */
export const CHROME_STOPS = [0, 0.26, 0.5, 0.76, 1] as const;

/** The one yellow button every page has. */
export const goldButton = {
  top: '#FFF07A',
  bottom: '#FFD92E',
  ring: '#FFFAD0',
  glow: '#FFE14A',
  /** the darker band along its bottom edge */
  lip: 'rgba(180, 120, 0, 0.28)',
} as const;

export const coinPaint = { fill: '#FFC928', edge: '#FFE98A', star: '#FFF3C4' } as const;

/** A pack's foil wrapper: five colours across it, where they sit, and the light it throws. */
export interface Foil {
  colors: readonly [string, string, string, string, string];
  stops: readonly [number, number, number, number, number];
  glow: string;
  /** the line of the picture in its badge */
  ink: string;
}

export const foil = {
  playground: { colors: ['#0FA58A', '#2DE2E6', '#C8FFF4', '#2DE2E6', '#0E8F7A'], stops: [0, 0.38, 0.5, 0.62, 1], glow: '#2DE2E6', ink: '#7CF3F5' },
  allstar: { colors: ['#2B4BFF', '#5C7CFF', '#D5DCFF', '#7B5CFF', '#3A1FB8'], stops: [0, 0.36, 0.5, 0.64, 1], glow: '#7B6CFF', ink: '#B9C4FF' },
  legend: { colors: ['#7A1FB8', '#FF3DA5', '#FFE9A8', '#FFB800', '#C96A00'], stops: [0, 0.34, 0.5, 0.66, 1], glow: '#FFB800', ink: '#FFD76A' },
} as const satisfies Record<string, Foil>;

/** A foil in a team's own two colours, for its team pack. */
export function teamFoil(color: string, color2: string): Foil {
  return { colors: [blend(color, night.black, 0.35), color, blend(color, night.white, 0.78), color2, blend(color2, night.black, 0.4)], stops: [0, 0.36, 0.5, 0.64, 1], glow: color, ink: blend(color, night.white, 0.55) };
}

export const neonFont = {
  /** fat block capitals: page titles, names, the words on buttons */
  display: 'Bungee_400Regular',
  /** one bent tube: signs and the rarity word */
  sign: 'TiltNeon_400Regular',
  /** squared-off scoreboard print for everything else */
  medium: 'ChakraPetch_500Medium',
  body: 'ChakraPetch_600SemiBold',
  bold: 'ChakraPetch_700Bold',
} as const;

export type NeonFace = keyof typeof neonFont;

/** line height for a font size of 1: block capitals sit tight, print needs room for its tails */
export const neonLeading: Record<NeonFace, number> = { display: 1.12, sign: 1.16, medium: 1.25, body: 1.25, bold: 1.25 };

/** lettering sizes */
export const neonText = {
  micro: px(10.5),
  tiny: px(12),
  small: px(13),
  body: px(14.5),
  large: px(17),
  sign: px(20),
  title: px(23),
  big: px(34),
  huge: px(42),
} as const;

export type NeonSize = keyof typeof neonText;

/** space between letters: scoreboard print is set wide */
export const track = {
  none: 0,
  tight: 0.3 * uiScale,
  close: 0.5 * uiScale,
  normal: 0.8 * uiScale,
  wide: 1.2 * uiScale,
  wider: 1.6 * uiScale,
  widest: 2.4 * uiScale,
} as const;

/** sizes of the arcade's own pieces */
export const arcade = {
  /** the strip along the top of every page, and the line under it */
  bar: px(48),
  barLine: px(2),
  /** a chip in the bar */
  chip: px(32),
  /** the round back and settings buttons (inside a full-size tap target) */
  round: px(34),
  /** a lit tube's thickness, and a quiet outline's */
  outline: px(2),
  hairline: px(1.5),
  /** a lamp in a segmented bar */
  seg: px(10),
  segSmall: px(8),
  segGap: px(4),
  /** corners */
  rChip: px(7),
  rPlate: px(6),
  rCell: px(8),
  rButton: px(10),
  rWell: px(12),
  rTile: px(14),
  rBig: px(16),
  rPanel: px(18),
  rSeg: px(2),
} as const;

/** `#RRGGBB` at an opacity. */
export function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A colour for a gradient stop inside a drawing: `<Stop offset={0} {...stop(night.beam)} />`.
 * A phone throws away the see-through part of a stop's colour (a browser keeps it), so a colour
 * written `rgba(...)` has to hand its opacity over separately or the gradient comes out solid.
 */
export function stop(color: string): { stopColor: string; stopOpacity: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (!m) return { stopColor: color, stopOpacity: 1 };
  const n = (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]);
  return { stopColor: `#${n.toString(16).padStart(6, '0').toUpperCase()}`, stopOpacity: m[4] === undefined ? 1 : Number(m[4]) };
}

/** A colour part of the way to another. */
export function blend(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1, 7), 16);
  const y = parseInt(b.slice(1, 7), 16);
  const ch = (shift: number) => {
    const u = (x >> shift) & 255;
    const v = (y >> shift) & 255;
    return Math.round(u + (v - u) * t);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1).toUpperCase()}`;
}

/** Light spilling out of a tube: a soft halo round a box. `reach` and `spread` are design sizes. */
export function halo(color: string, reach = 12, alpha = 0.7, spread = 0): BoxShadowValue {
  return { offsetX: 0, offsetY: 0, blurRadius: px(reach), spreadDistance: px(spread), color: fade(color, alpha) };
}

/** The same light falling inward. */
export function inner(color: string, reach = 14, alpha = 0.3): BoxShadowValue {
  return { offsetX: 0, offsetY: 0, blurRadius: px(reach), spreadDistance: 0, color: fade(color, alpha), inset: true };
}

/** A crisp ring just outside a box. */
export function ring(color: string, width = 2): BoxShadowValue {
  return { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: px(width), color };
}
