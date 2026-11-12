/**
 * The figure kit: every body part, hair style, face and accessory exported
 * from the Blender pipeline (tools/blender/build_kit.py), decoded on demand.
 *
 * Parts are stored relative to the joint they hang from, with one colour slot
 * per vertex, so one set of meshes dresses every player.
 */

import raw from './kitData.json';

export interface KitBone {
  name: string;
  parent: string | null;
  pivot: [number, number, number];
}

export interface KitPart {
  bone: number;
  vertexCount: number;
  triangleCount: number;
  /** xyz per vertex, relative to the bone pivot (three.js axes: Y up, figure faces +Z) */
  positions: Float32Array;
  /** unit normals, -127..127 */
  normals: Int8Array;
  /** slot index per vertex */
  slots: Uint8Array;
  indices: Uint16Array;
  /** swing pivot for hair pieces that move on their own */
  pivot: [number, number, number] | null;
}

interface RawPart {
  bone: string;
  v: number;
  t: number;
  pos: string;
  nrm: string;
  slot: string;
  idx: string;
  pivot?: number[];
}

interface RawKit {
  version: number;
  posScale: number;
  slots: string[];
  bones: { name: string; parent: string | null; pivot: number[] }[];
  metrics: {
    height: number;
    headCenter: number[];
    headRadius: number[];
    ballRadius: number;
    upperArm: number;
    forearm: number;
    hand: number;
    thigh: number;
    shin: number;
    ankle: number;
  };
  styles: {
    eyes: string[];
    brows: string[];
    mouths: string[];
    noses: string[];
    hats: string[];
    hair: string[];
    volumeHair: string[];
    facial: string[];
    accessories: string[];
  };
  parts: Record<string, RawPart>;
}

const data = raw as unknown as RawKit;

export const KIT_SLOTS: readonly string[] = data.slots;
export const KIT_SLOT_INDEX: Record<string, number> = Object.fromEntries(data.slots.map((s, i) => [s, i]));
export const KIT_BONES: readonly KitBone[] = data.bones.map((b) => ({
  name: b.name,
  parent: b.parent,
  pivot: [b.pivot[0], b.pivot[1], b.pivot[2]],
}));
export const KIT_BONE_INDEX: Record<string, number> = Object.fromEntries(data.bones.map((b, i) => [b.name, i]));
export const KIT_METRICS = data.metrics;
export const KIT_STYLES = data.styles;
export const BONE_COUNT = KIT_BONES.length;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Base64 to bytes without relying on atob (not every JS engine on a phone has it). */
export function decodeBase64(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s.charCodeAt(len - 1) === 61) len--;
  const out = new Uint8Array((len * 3) >> 2);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    acc = (acc << 6) | B64_LOOKUP[s.charCodeAt(i) & 127];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out;
}

const cache = new Map<string, KitPart | null>();

export function hasPart(name: string): boolean {
  return name in data.parts;
}

export function getPart(name: string): KitPart | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const r = data.parts[name];
  if (!r) {
    cache.set(name, null);
    return null;
  }
  const posBytes = decodeBase64(r.pos);
  const q = new Int16Array(posBytes.buffer, posBytes.byteOffset, r.v * 3);
  const positions = new Float32Array(r.v * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = q[i] * data.posScale;
  const nBytes = decodeBase64(r.nrm);
  const normals = new Int8Array(nBytes.buffer, nBytes.byteOffset, r.v * 3);
  const slots = decodeBase64(r.slot);
  const iBytes = decodeBase64(r.idx);
  const indices = new Uint16Array(iBytes.buffer, iBytes.byteOffset, r.t * 3);
  const part: KitPart = {
    bone: KIT_BONE_INDEX[r.bone] ?? 0,
    vertexCount: r.v,
    triangleCount: r.t,
    positions,
    normals,
    slots,
    indices,
    pivot: r.pivot ? [r.pivot[0], r.pivot[1], r.pivot[2]] : null,
  };
  cache.set(name, part);
  return part;
}

export function partNames(): string[] {
  return Object.keys(data.parts);
}
