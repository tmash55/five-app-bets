/**
 * Turns a `Look` into one mesh: every kit part the look needs, merged, with
 * the palette baked into vertex colours and a bone index per vertex.
 */

import * as THREE from 'three';

import { BONE_COUNT, KIT_SLOTS, getPart } from '../kit/kit';
import { hexToRgb, paletteFor, partsFor, type Look } from '../kit/look';
import { FIGURE_FRAG, FIGURE_VERT } from './shaders';

export interface FigureBuild {
  height: number;
  bulk: number;
  head: number;
}

export interface FigureMeshData {
  geometry: THREE.BufferGeometry;
  /** swing pivots of the loose hair pieces (figure space), when the style has them */
  hairPivotA: [number, number, number] | null;
  hairPivotB: [number, number, number] | null;
  build: FigureBuild;
  triangles: number;
}

/** Thin shapes painted onto the head and jersey get nudged toward the camera so they never flicker. */
function decalLayer(part: string, slot: string): number {
  if (part.startsWith('eye.')) return slot === 'eyeShine' ? 2 : 1;
  if (part.startsWith('brow.')) return 1;
  if (part.startsWith('mouth.')) return slot === 'teeth' || slot === 'tongue' ? 2 : 1;
  if (part.startsWith('num.')) return 1;
  if (part.startsWith('facial.')) return 1;
  if (slot === 'blush' || slot === 'freckle' || slot === 'bandaid') return 1;
  if (part === 'acc.lashes') return 1;
  return 0;
}

export function buildFigureGeometry(look: Look): FigureMeshData {
  const names = partsFor(look);
  const palette = paletteFor(look);
  const slotRgb: [number, number, number][] = KIT_SLOTS.map((s) => hexToRgb(palette[s] ?? '#FF00FF'));
  let vTotal = 0;
  let iTotal = 0;
  for (const n of names) {
    const part = getPart(n);
    if (!part) continue;
    vTotal += part.vertexCount;
    iTotal += part.indices.length;
  }
  const pos = new Float32Array(vTotal * 3);
  const nrm = new Float32Array(vTotal * 3);
  const col = new Float32Array(vTotal * 4);
  const bone = new Float32Array(vTotal);
  const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  let hairPivotA: [number, number, number] | null = null;
  let hairPivotB: [number, number, number] | null = null;
  let v0 = 0;
  let i0 = 0;
  for (const n of names) {
    const part = getPart(n);
    if (!part) continue;
    if (part.pivot) {
      if (n.endsWith('.A')) hairPivotA = part.pivot;
      else if (n.endsWith('.B')) hairPivotB = part.pivot;
    }
    pos.set(part.positions, v0 * 3);
    for (let i = 0; i < part.vertexCount; i++) {
      const s = part.slots[i];
      const rgb = slotRgb[s];
      const o = (v0 + i) * 3;
      nrm[o] = part.normals[i * 3] / 127;
      nrm[o + 1] = part.normals[i * 3 + 1] / 127;
      nrm[o + 2] = part.normals[i * 3 + 2] / 127;
      const c = (v0 + i) * 4;
      col[c] = rgb[0];
      col[c + 1] = rgb[1];
      col[c + 2] = rgb[2];
      col[c + 3] = decalLayer(n, KIT_SLOTS[s]);
      bone[v0 + i] = part.bone;
    }
    for (let i = 0; i < part.indices.length; i++) idx[i0 + i] = part.indices[i] + v0;
    v0 += part.vertexCount;
    i0 += part.indices.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geometry.setAttribute('bone', new THREE.BufferAttribute(bone, 1));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  // limbs move well outside the rest pose, so give culling a generous bound
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
  const b = look.build ?? {};
  return {
    geometry,
    hairPivotA,
    hairPivotB,
    build: { height: b.height ?? 1, bulk: b.bulk ?? 1, head: b.head ?? 1 },
    triangles: iTotal / 3,
  };
}

/** Uniforms every lit material shares, so a theme change is one write. */
export interface LightUniforms {
  [uniform: string]: THREE.IUniform;
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Vector3 };
  uSkyCol: { value: THREE.Vector3 };
  uGroundCol: { value: THREE.Vector3 };
  uRimCol: { value: THREE.Vector3 };
}

export function newLightUniforms(): LightUniforms {
  return {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
    uSunCol: { value: new THREE.Vector3(0.62, 0.6, 0.55) },
    uSkyCol: { value: new THREE.Vector3(0.52, 0.56, 0.66) },
    uGroundCol: { value: new THREE.Vector3(0.4, 0.37, 0.36) },
    uRimCol: { value: new THREE.Vector3(0.3, 0.3, 0.28) },
  };
}

/** One drawable figure: geometry + its own bone palette. */
export class FigureView {
  readonly mesh: THREE.Mesh;
  readonly bones = new Float32Array(BONE_COUNT * 16);
  readonly data: FigureMeshData;
  private readonly material: THREE.RawShaderMaterial;

  constructor(look: Look, lights: LightUniforms) {
    this.data = buildFigureGeometry(look);
    for (let b = 0; b < BONE_COUNT; b++) {
      this.bones[b * 16] = 1;
      this.bones[b * 16 + 5] = 1;
      this.bones[b * 16 + 10] = 1;
      this.bones[b * 16 + 15] = 1;
    }
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FIGURE_VERT,
      fragmentShader: FIGURE_FRAG,
      uniforms: {
        ...lights,
        uBones: { value: this.bones },
        uFlash: { value: 0 },
        uGlow: { value: new THREE.Vector3(0, 0, 0) },
        uBaseY: { value: 0 },
        uDecalBias: { value: 0.00016 },
      },
    });
    this.mesh = new THREE.Mesh(this.data.geometry, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
  }

  setFlash(v: number): void {
    this.material.uniforms.uFlash.value = v;
  }

  setGlow(r: number, g: number, b: number): void {
    (this.material.uniforms.uGlow.value as THREE.Vector3).set(r, g, b);
  }

  setBaseY(y: number): void {
    this.material.uniforms.uBaseY.value = y;
  }

  dispose(): void {
    this.data.geometry.dispose();
    this.material.dispose();
  }
}
