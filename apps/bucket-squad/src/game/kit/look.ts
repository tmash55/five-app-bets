/**
 * A "look" describes one character: skin, hair, face, kit colours and build.
 * The same shape is read by the Blender scripts (tools/blender/mk/assemble.py)
 * that render card art, so `paletteFor` and `partsFor` here must stay in step
 * with `palette()` and `build_parts()` there.
 */

import { KIT_STYLES, hasPart } from './kit';

export interface KitColors {
  jersey: string;
  trim: string;
  number: string;
  shorts: string;
  shortsTrim: string;
  shoe: string;
  shoeAccent: string;
  sole: string;
  sock: string;
  band: string;
}

export interface Look {
  skin: string;
  hair: { style: string; color: string };
  eyes?: string;
  brows?: string;
  mouth?: string;
  nose?: string;
  facial?: string;
  accessories?: string[];
  number?: string | number;
  top?: 'jersey' | 'tee';
  undershirt?: string;
  bottom?: 'shorts' | 'pants';
  shortShorts?: boolean;
  highSocks?: boolean;
  sleeveColor?: string;
  hatColor?: string;
  hatBrimColor?: string;
  browColor?: string;
  frameColor?: string;
  blush?: boolean;
  kit?: Partial<KitColors>;
  build?: { height?: number; bulk?: number; head?: number };
}

export const DEFAULT_KIT: KitColors = {
  jersey: '#E8483A',
  trim: '#FFFFFF',
  number: '#FFFFFF',
  shorts: '#E8483A',
  shortsTrim: '#FFFFFF',
  shoe: '#FFFFFF',
  shoeAccent: '#E8483A',
  sole: '#F4F1EA',
  sock: '#FFFFFF',
  band: '#FFFFFF',
};

// ---------------------------------------------------------------------------
// Colour helpers (same maths as Python's colorsys, so both sides agree)
// ---------------------------------------------------------------------------

export function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c * 255))))
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const l = (minc + maxc) / 2;
  if (minc === maxc) return [0, l, 0];
  const d = maxc - minc;
  const s = l <= 0.5 ? d / (maxc + minc) : d / (2 - maxc - minc);
  const rc = (maxc - r) / d;
  const gc = (maxc - g) / d;
  const bc = (maxc - b) / d;
  let h: number;
  if (r === maxc) h = bc - gc;
  else if (g === maxc) h = 2 + rc - bc;
  else h = 4 + gc - rc;
  h = (((h / 6) % 1) + 1) % 1;
  return [h, l, s];
}

function hlsValue(m1: number, m2: number, hue: number): number {
  const h = ((hue % 1) + 1) % 1;
  if (h < 1 / 6) return m1 + (m2 - m1) * h * 6;
  if (h < 0.5) return m2;
  if (h < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
  return m1;
}

function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  return [hlsValue(m1, m2, h + 1 / 3), hlsValue(m1, m2, h), hlsValue(m1, m2, h - 1 / 3)];
}

/** Scale a colour's lightness and saturation. */
export function shade(h: string, lightness = 1, saturation = 1): string {
  const [r, g, b] = hexToRgb(h);
  const [hh, ll, ss] = rgbToHls(r, g, b);
  return rgbToHex(hlsToRgb(hh, Math.max(0, Math.min(1, ll * lightness)), Math.max(0, Math.min(1, ss * saturation))));
}

export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t));
}

export function luminance(h: string): number {
  const [r, g, b] = hexToRgb(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------------------------------------------------------------------------
// Palette and parts
// ---------------------------------------------------------------------------

/** Colour for every kit slot. Mirrors `palette()` in tools/blender/mk/assemble.py. */
export function paletteFor(look: Look): Record<string, string> {
  const kit: KitColors = { ...DEFAULT_KIT, ...(look.kit ?? {}) };
  const skin = look.skin ?? '#C68642';
  const acc = new Set(look.accessories ?? []);
  const hairC = look.hair?.color ?? '#1C1310';
  const band = kit.band;
  const sleeve = look.sleeveColor ?? band;
  const top = look.top ?? 'jersey';
  const under = look.undershirt;
  const pants = (look.bottom ?? 'shorts') === 'pants';
  const armUp = (side: 'L' | 'R') => (top === 'tee' ? kit.jersey : under ? under : acc.has(`sleeve${side}`) ? sleeve : skin);
  const cuff = (side: 'L' | 'R') => (top === 'tee' ? kit.trim : under ? under : acc.has(`sleeve${side}`) ? sleeve : skin);
  const hat = look.hatColor ?? kit.jersey;
  return {
    skin,
    jersey: kit.jersey,
    jerseyTrim: kit.trim,
    number: kit.number,
    shorts: kit.shorts,
    shortsTrim: kit.shortsTrim,
    shortsShadow: shade(kit.shorts, 0.45),
    shoe: kit.shoe,
    shoeAccent: kit.shoeAccent,
    sole: kit.sole,
    sock: kit.sock,
    sockHigh: pants ? kit.shorts : look.highSocks ? kit.sock : skin,
    kneeL: pants ? kit.shorts : acc.has('kneepadL') || acc.has('legSleeveL') ? sleeve : skin,
    kneeR: pants ? kit.shorts : acc.has('kneepadR') || acc.has('legSleeveR') ? sleeve : skin,
    sleeveUpL: armUp('L'),
    sleeveUpR: armUp('R'),
    cuffL: cuff('L'),
    cuffR: cuff('R'),
    sleeveLoL: acc.has('sleeveL') ? sleeve : skin,
    sleeveLoR: acc.has('sleeveR') ? sleeve : skin,
    wristL: acc.has('wristbandL') ? band : acc.has('sleeveL') ? sleeve : skin,
    wristR: acc.has('wristbandR') ? band : acc.has('sleeveR') ? sleeve : skin,
    hair: hairC,
    brow: look.browColor ?? (luminance(hairC) > 0.25 ? shade(hairC, 0.55) : hairC),
    eye: '#17120F',
    eyeShine: '#FFFFFF',
    mouth: '#5B241E',
    teeth: '#FFFFFF',
    band,
    frame: look.frameColor ?? '#1E1E24',
    blush: mix(skin, '#FF6F7D', 0.38),
    nose: mix(shade(skin, 0.96), '#E8695F', 0.14),
    earIn: shade(skin, 0.84),
    tongue: '#F2707F',
    hat,
    hatBrim: look.hatBrimColor ?? shade(hat, 0.78),
    freckle: shade(skin, 0.68),
    bandaid: '#F2D3A6',
    ball: '#E8792B',
    seam: '#2A1A14',
  };
}

const HATS = new Set(KIT_STYLES.hats);
const VOLUME = new Set(KIT_STYLES.volumeHair);
const HEAD_ACCESSORIES = new Set(KIT_STYLES.accessories);
const HAT_TAILS = new Set(['ponytail', 'pigtails', 'long', 'braids', 'locs']);

/** Where a jersey digit goes: front/back, one digit or two. */
export function numberParts(number: string | number | undefined): string[] {
  if (number === undefined || number === null || number === '') return [];
  const n = String(number).slice(0, 2);
  if (!/^\d+$/.test(n)) return [];
  if (n.length === 1) return [`num.f1.${n}`, `num.b1.${n}`];
  return [`num.f2l.${n[0]}`, `num.f2r.${n[1]}`, `num.b2l.${n[0]}`, `num.b2r.${n[1]}`];
}

/** Names of the kit parts that make up a look. Mirrors `build_parts()` in assemble.py. */
export function partsFor(look: Look): string[] {
  const eyes = look.eyes ?? 'oval';
  const brows = look.brows ?? 'calm';
  const hairStyle = look.hair?.style ?? 'buzz';
  const accessories = [...(look.accessories ?? [])];
  if (look.blush !== false && !accessories.includes('blush')) accessories.push('blush');
  const wearingHat = accessories.some((a) => HATS.has(a));
  const parts: string[] = ['head', `eye.${eyes}.L`, `eye.${eyes}.R`, `brow.${brows}.${eyes}`, `mouth.${look.mouth ?? 'smile'}`];
  if (hairStyle !== 'bald' && hairStyle !== 'none') {
    if (wearingHat) {
      parts.push(`hairHat.${hairStyle}`);
      if (HAT_TAILS.has(hairStyle)) parts.push(`hair.${hairStyle}.A`, `hair.${hairStyle}.B`);
    } else {
      parts.push(`hair.${hairStyle}`, `hair.${hairStyle}.A`, `hair.${hairStyle}.B`);
    }
  }
  const nose = look.nose ?? 'button';
  if (nose !== 'none') parts.push(`nose.${nose}`);
  if (look.facial && look.facial !== 'none') parts.push(`facial.${look.facial}`);
  for (const a of accessories) {
    if (!HEAD_ACCESSORIES.has(a)) continue;
    if ((a === 'headband' || a === 'sweatband') && VOLUME.has(hairStyle)) parts.push(`acc.${a}.low`);
    else parts.push(`acc.${a}`);
  }
  parts.push('torso', ...numberParts(look.number), 'pelvis');
  const thigh = look.shortShorts ? 'short' : 'long';
  for (const s of ['L', 'R']) {
    parts.push(`thigh.${thigh}.${s}`, `shin.${s}`, `shoe.${s}`, `armUp.${s}`, `armLo.${s}`, `hand.${s}`);
  }
  return parts.filter(hasPart);
}
