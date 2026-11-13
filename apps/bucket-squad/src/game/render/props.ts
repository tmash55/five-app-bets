/**
 * Small builders both 3D views share: wrapping an expo-gl context in a three
 * renderer, and the basketball mesh.
 */

import { Platform } from 'react-native';
import * as THREE from 'three';

import { KIT_SLOTS, getPart } from '../kit/kit';
import { hexToRgb, paletteFor } from '../kit/look';

/** A three renderer over a GL context made elsewhere (expo-gl). `alpha` keeps the clear see-through. */
export function wrapContext(gl: WebGL2RenderingContext, alpha: boolean): THREE.WebGLRenderer {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  // three only needs something canvas-shaped around the context it is handed
  const canvas = {
    width: w,
    height: h,
    style: {},
    clientWidth: w,
    clientHeight: h,
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  };
  const three = new THREE.WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    antialias: true,
    alpha,
    premultipliedAlpha: true,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  });
  three.setPixelRatio(1);
  three.setClearColor(0x000000, alpha ? 0 : 1);
  // checking a shader means asking GL for its status, which on a phone waits for every frame already queued
  three.debug.checkShaderErrors = Platform.OS === 'web' && __DEV__;
  return three;
}

interface LazyProgram {
  getUniforms(): unknown;
  getAttributes(): unknown;
}

/**
 * Builds every shader program the scene can ever need, hidden objects
 * included, and asks GL everything three would otherwise ask the first time a
 * program is used. On native expo-gl each of those questions blocks until the
 * GL thread has drawn everything queued, so they must all happen before the
 * first frame, never in the middle of play. Returns how many programs exist.
 */
export function warmUp(three: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): number {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  scene.updateMatrixWorld(true);
  three.compile(scene, camera);
  for (const o of hidden) o.visible = false;
  const programs = (three.info.programs ?? []) as unknown as LazyProgram[];
  for (const p of programs) {
    p.getUniforms();
    p.getAttributes();
  }
  return programs.length;
}

/** How many shader programs exist now: should never grow after `warmUp`. */
export function programCount(three: THREE.WebGLRenderer): number {
  return three.info.programs?.length ?? 0;
}

/** The ball: kit mesh, palette baked into vertex colours. */
export function buildBallGeometry(): THREE.BufferGeometry {
  const ballPart = getPart('ball');
  const ballGeo = new THREE.BufferGeometry();
  if (ballPart) {
    const pal = paletteFor({ skin: '#000000', hair: { style: 'bald', color: '#000000' } });
    const col = new Float32Array(ballPart.vertexCount * 3);
    const nrm = new Float32Array(ballPart.vertexCount * 3);
    for (let i = 0; i < ballPart.vertexCount; i++) {
      const c = hexToRgb(pal[KIT_SLOTS[ballPart.slots[i]]] ?? '#E8792B');
      col.set(c, i * 3);
      nrm[i * 3] = ballPart.normals[i * 3] / 127;
      nrm[i * 3 + 1] = ballPart.normals[i * 3 + 1] / 127;
      nrm[i * 3 + 2] = ballPart.normals[i * 3 + 2] / 127;
    }
    ballGeo.setAttribute('position', new THREE.BufferAttribute(ballPart.positions, 3));
    ballGeo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    ballGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ballGeo.setIndex(new THREE.BufferAttribute(ballPart.indices, 1));
  }
  return ballGeo;
}
