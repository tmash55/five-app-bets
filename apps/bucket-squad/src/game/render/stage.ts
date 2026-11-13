/**
 * The warm-up stage: a few figures on a round display base, drawn over
 * whatever is behind the GL view (the clear is transparent), each one running
 * its own playlist of warm-up acts from the director.
 *
 * It takes groups, each with its own base, kit and placement, so a screen can
 * later show two squads facing each other; the home screen shows one.
 */

import * as THREE from 'three';

import type { KitColors, Look } from '../kit/look';
import { BALL_R } from '../sim/constants';
import { clamp, clamp01 } from '../sim/math';
import { ACT_LENGTH, ROLE_HAS_BALL, actAt, newActSlot, type ActSlot, type StageAct, type StageRole } from '../stage/director';
import { FigureAnimator, type ShowFrame } from './animator';
import { COURTS, type CourtId } from './court';
import { FigureView, newLightUniforms, type LightUniforms } from './figure';
import { MeshBuilder, rgb, tint, type Rgb } from './geo';
import { buildBallGeometry, programCount, warmUp, wrapContext } from './props';
import { BASE_FRAG, BASE_VERT, DROP_FRAG, STATIC_FRAG, STATIC_VERT, UNLIT_VERT } from './shaders';

export interface StageMember {
  look: Look;
  role: StageRole;
}

export interface StageGroup {
  /** captain first; the captain stands in the middle, a step in front */
  members: StageMember[];
  /** the uniform they wear, which paints the base */
  kit: KitColors;
  /** the team's main colour, and its home court for the floor of the base */
  color: string;
  court: CourtId;
  /** where the group's base stands, and how far it is turned (0 faces the camera) */
  x: number;
  z: number;
  turn: number;
}

export interface StageSetup {
  groups: StageGroup[];
  /** shuffles the act playlists */
  seed: number;
}

/** Where on the view the group should sit, as fractions of its width and height. */
export interface StageFocus {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BASE_R = 1.24;
const BASE_H = 0.2;
const FOV = 15;
/** how far the camera looks down on the group */
const PITCH = 0.105;
/** the captain's share of the view's height */
const CAPTAIN_SHARE = 0.64;
/** how much room a group needs: across, and from the bottom of the base to the tops of the heads (arms and a tossed ball may go higher) */
const GROUP_W = 2.5;
const GROUP_H = 1.98;
const GROUP_MID_Y = 0.94;
const SHADOWS = 16;
const HEY_LENGTH = ACT_LENGTH.hey;

/** Spots on the base: the captain in front in the middle, the others a step back and turned in. */
const SPOTS = [
  { x: 0, z: 0.36, turn: 0, side: 0 },
  { x: -0.8, z: -0.4, turn: 0.32, side: -1 },
  { x: 0.8, z: -0.4, turn: -0.32, side: 1 },
] as const;

interface Actor {
  group: number;
  index: number;
  role: StageRole;
  hasBall: boolean;
  hand: number;
  fig: FigureView;
  anim: FigureAnimator;
  ball: THREE.Mesh | null;
  ballQ: THREE.Quaternion;
  x: number;
  z: number;
  facing: number;
  side: number;
  /** actor time = stage time - shift (moves when a tap or a forced act interrupts the playlist) */
  shift: number;
  /** an act played instead of the playlist (a tap, or the dev handle), until `overEnd` */
  over: StageAct | null;
  overStart: number;
  overEnd: number;
  overCount: number;
  slot: ActSlot;
  /** screen box from the last frame, for taps: x0, y0, x1, y1 in 0..1 from the top left */
  box: Float32Array;
}

export class StageRenderer {
  private readonly three: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 80);
  private readonly lights: LightUniforms = newLightUniforms();
  private readonly actors: Actor[] = [];
  private readonly baseU: Record<string, THREE.IUniform>[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly frame: ShowFrame;
  private readonly seed: number;
  private readonly groups: StageGroup[];
  private readonly focus: StageFocus = { x: 0, y: 0, w: 1, h: 1 };
  private width = 1;
  private height = 1;
  private time = 0;
  private dist = 9;
  private midX = 0;
  private midZ = 0;
  private captainH = 1.57;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly shadowN: Int32Array;
  /** shader programs built before the first frame (tooling: `programs` should never grow past it) */
  readonly warmPrograms: number;

  constructor(gl: WebGL2RenderingContext, setup: StageSetup) {
    this.seed = setup.seed;
    this.groups = setup.groups;
    this.three = wrapContext(gl, true);
    this.three.sortObjects = true;
    this.scene.matrixAutoUpdate = false;

    // studio light: a warm key from the upper front left, a cool fill from the sky, a gentle rim
    const L = this.lights;
    L.uSunDir.value.set(-0.52, 0.72, 0.6).normalize();
    L.uSunCol.value.set(0.66, 0.6, 0.52);
    L.uSkyCol.value.set(0.48, 0.54, 0.68);
    L.uGroundCol.value.set(0.44, 0.4, 0.38);
    L.uRimCol.value.set(0.34, 0.37, 0.46);

    const staticMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: STATIC_VERT,
      fragmentShader: STATIC_FRAG,
      uniforms: {
        ...L,
        uFogCol: { value: new THREE.Vector3(1, 1, 1) },
        uFogNear: { value: 1000 },
        uFogFar: { value: 2000 },
        uUnlit: { value: 0 },
        uTime: { value: 0 },
        uCheer: { value: 0 },
      },
    });
    const ballGeo = buildBallGeometry();
    const disc = new THREE.PlaneGeometry(1, 1);
    disc.rotateX(-Math.PI / 2);
    this.disposables.push(staticMat, ballGeo, disc);

    let variant = 1;
    this.groups.forEach((g, gi) => {
      // --- the base
      const theme = COURTS[g.court];
      const jersey = rgb(g.kit.jersey);
      const trim = rgb(g.kit.trim);
      const mb = new MeshBuilder();
      mb.cyl(0, -BASE_H, 0, BASE_R * 0.97, BASE_R, BASE_H * 0.42, 72, tint(jersey, 0.72), tint(jersey, 0.82), false);
      mb.cyl(0, -BASE_H * 0.58, 0, BASE_R, BASE_R, BASE_H * 0.16, 72, trim, trim, false);
      mb.cyl(0, -BASE_H * 0.42, 0, BASE_R, BASE_R, BASE_H * 0.42, 72, tint(jersey, 0.86), jersey, false);
      mb.torus(0, -0.005, 0, BASE_R - 0.035, 0.04, 72, 10, trim);
      mb.disc(0, 0, 0, BASE_R - 0.03, 96, jersey);
      const baseGeo = mb.build();
      const u: Record<string, THREE.IUniform> = {
        ...L,
        uRadius: { value: BASE_R - 0.075 },
        uCourtCol: { value: vec(rgb(theme.floor.court)) },
        uBandCol: { value: vec(jersey) },
        uCircleCol: { value: vec(rgb(g.color)) },
        uLineCol: { value: vec(rgb(theme.floor.line)) },
        uShadows: { value: new Float32Array(SHADOWS * 4) },
      };
      const baseMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BASE_VERT, fragmentShader: BASE_FRAG, uniforms: u });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(g.x, 0, g.z);
      base.rotation.y = g.turn;
      base.updateMatrix();
      base.matrixAutoUpdate = false;
      base.renderOrder = -2;
      this.scene.add(base);
      this.baseU.push(u);
      this.disposables.push(baseGeo, baseMat);

      // --- its shadow on the backdrop
      const dropMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: UNLIT_VERT,
        fragmentShader: DROP_FRAG,
        uniforms: { uStrength: { value: 0.42 } },
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      });
      const drop = new THREE.Mesh(disc, dropMat);
      drop.position.set(g.x + 0.08, -BASE_H - 0.004, g.z - 0.05);
      drop.scale.set(BASE_R * 2.5, 1, BASE_R * 2.3);
      drop.updateMatrix();
      drop.matrixAutoUpdate = false;
      drop.renderOrder = -3;
      this.scene.add(drop);
      this.disposables.push(dropMat);

      // --- the figures
      const cg = Math.cos(g.turn);
      const sg = Math.sin(g.turn);
      g.members.forEach((m, mi) => {
        const spot = SPOTS[mi % SPOTS.length];
        const fig = new FigureView(m.look, L);
        const anim = new FigureAnimator(fig.data.build, fig.data.hairPivotA, fig.data.hairPivotB, variant);
        variant += 3;
        this.scene.add(fig.mesh);
        const hasBall = ROLE_HAS_BALL[m.role];
        let ball: THREE.Mesh | null = null;
        if (hasBall) {
          ball = new THREE.Mesh(ballGeo, staticMat);
          ball.matrixAutoUpdate = false;
          ball.frustumCulled = false;
          this.scene.add(ball);
        }
        if (mi === 0) this.captainH = 1.57 * fig.data.build.height;
        // the base turns with the group: spots are in the base's own frame
        const lx = spot.x;
        const lz = spot.z;
        this.actors.push({
          group: gi,
          index: mi,
          role: m.role,
          hasBall,
          // the captain spins with the right hand; side players lead with their outside hand
          hand: spot.side === 0 ? -1 : spot.side,
          fig,
          anim,
          ball,
          ballQ: new THREE.Quaternion(),
          x: g.x + lx * cg + lz * sg,
          z: g.z - lx * sg + lz * cg,
          facing: Math.PI / 2 - g.turn - spot.turn,
          side: spot.side,
          shift: 0,
          over: null,
          overStart: 0,
          overEnd: 0,
          overCount: 0,
          slot: newActSlot(),
          box: new Float32Array(4),
        });
      });
    });
    let mx = 0;
    let mz = 0;
    for (const g of this.groups) {
      mx += g.x;
      mz += g.z;
    }
    this.midX = mx / Math.max(1, this.groups.length);
    this.midZ = mz / Math.max(1, this.groups.length);

    this.frame = {
      act: 'enter',
      t: 0,
      dur: 1,
      index: 0,
      x: 0,
      z: 0,
      facing: 0,
      hasBall: false,
      hand: -1,
      side: 0,
      variety: 0,
      camX: 0,
      camY: 1,
      camZ: 9,
      palX: 0,
      palY: 1,
      palZ: 0,
      dt: 0,
      time: 0,
    };
    this.shadowN = new Int32Array(this.groups.length);
    this.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    // every program the show uses is built and queried now: none may be built while it plays
    this.warmPrograms = warmUp(this.three, this.scene, this.camera);
  }

  get programs(): number {
    return programCount(this.three);
  }

  get stageTime(): number {
    return this.time;
  }

  get actorCount(): number {
    return this.actors.length;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.three.setSize(this.width, this.height, false);
    this.frameCamera();
  }

  /** Where the group should sit on the view (fractions of its size, from the top left). */
  setFocus(f: StageFocus): void {
    const o = this.focus;
    if (o.x === f.x && o.y === f.y && o.w === f.w && o.h === f.h) return;
    o.x = f.x;
    o.y = f.y;
    o.w = f.w;
    o.h = f.h;
    this.frameCamera();
  }

  private frameCamera(): void {
    const W = this.width;
    const H = this.height;
    const f = this.focus;
    const span = this.groups.length > 1 ? GROUP_W * this.groups.length : GROUP_W;
    const bottom = (f.y + f.h) * H;
    // pixels per world unit: the captain at their share of the view's height, unless the group would not fit inside the
    // focus box (the heads stay below whatever is above the box; only a raised arm or a tossed ball goes past its top)
    const k = Math.min((H * CAPTAIN_SHARE) / this.captainH, (f.w * W) / span, (f.h * H * 0.98) / GROUP_H);
    const viewH = H / k;
    this.dist = viewH / 2 / Math.tan((FOV * Math.PI) / 360);
    const cam = this.camera;
    cam.fov = FOV;
    cam.aspect = W / H;
    cam.near = Math.max(0.5, this.dist - 8);
    cam.far = this.dist + 12;
    // the group's middle lands in the middle of the box across, and the front of the base at its bottom
    this.place(0, PITCH);
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    this.tmpV.set(this.midX, -BASE_H, this.midZ + BASE_R).project(cam);
    const footY = (0.5 - this.tmpV.y * 0.5) * H;
    const px = (f.x + f.w / 2) * W;
    cam.setViewOffset(W, H, W / 2 - px, footY - bottom, W, H);
    cam.updateProjectionMatrix();
  }

  /** Camera on its orbit round the group: `yaw` across, `pitch` up. */
  private place(yaw: number, pitch: number): void {
    const cam = this.camera;
    const d = this.dist;
    cam.position.set(this.midX + Math.sin(yaw) * d * Math.cos(pitch), GROUP_MID_Y + Math.sin(pitch) * d, this.midZ + Math.cos(yaw) * d * Math.cos(pitch));
    this.tmpV.set(this.midX, GROUP_MID_Y, this.midZ);
    cam.lookAt(this.tmpV);
    cam.updateMatrixWorld();
  }

  /** A tap on figure `i`: it hops and waves (or flexes) at the camera. False while it cannot react yet. */
  poke(i: number): boolean {
    const a = this.actors[i];
    if (!a) return false;
    if (a.over === 'hey' && this.time < a.overEnd - 0.35) return false;
    if (!a.over && a.slot.act === 'enter') return false;
    this.playOver(a, 'hey', HEY_LENGTH);
    return true;
  }

  /** Development: play `act` on figure `i` now, then carry on with the playlist. */
  force(i: number, act: StageAct): void {
    const a = this.actors[i];
    if (!a) return;
    this.playOver(a, act, ACT_LENGTH[act]);
  }

  private playOver(a: Actor, act: StageAct, dur: number): void {
    // the playlist picks up again at the start of the act after the one interrupted
    const at = this.time - a.shift;
    const slot = a.over ? null : actAt(this.seed + a.group * 7919, a.index, a.role, at);
    const resumeAt = slot ? slot.start + slot.dur : this.time - a.shift;
    a.over = act;
    a.overStart = this.time;
    a.overEnd = this.time + dur;
    a.overCount++;
    a.shift = a.overEnd - resumeAt;
  }

  /** The figure under a point on the view (0..1 from the top left), front ones first; -1 for none. */
  pick(x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      const b = a.box;
      if (a.anim.hidden || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      // closest to the camera wins where boxes overlap
      const d = -a.z + Math.abs(x - (b[0] + b[2]) / 2) * 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Advance by `dt` seconds and draw. `draw` false only moves time (tooling). */
  render(dt: number, draw = true): void {
    dt = clamp(dt, 0, 0.1);
    this.time += dt;
    const time = this.time;
    const cam = this.camera;

    // a slow, small sway for depth
    this.place(0.045 * Math.sin(time * 0.43) + 0.02 * Math.sin(time * 0.17 + 1), PITCH + 0.012 * Math.sin(time * 0.31 + 2));

    const f = this.frame;
    f.dt = dt;
    f.time = time;
    f.camX = cam.position.x;
    f.camY = cam.position.y;
    f.camZ = cam.position.z;
    for (const u of this.baseU) (u.uShadows.value as Float32Array).fill(0);
    const shadowN = this.shadowN;
    shadowN.fill(0);

    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      // which act, and how far into it
      if (a.over && time >= a.overEnd) a.over = null;
      if (a.over) {
        f.act = a.over;
        f.t = time - a.overStart;
        f.dur = a.overEnd - a.overStart;
        f.index = -a.overCount;
        a.slot.act = a.over;
      } else {
        actAt(this.seed + a.group * 7919, a.index, a.role, time - a.shift, a.slot);
        f.act = a.slot.act;
        f.t = a.slot.t;
        f.dur = a.slot.dur;
        f.index = a.slot.index;
      }
      f.x = a.x;
      f.z = a.z;
      f.facing = a.facing;
      f.hasBall = a.hasBall;
      f.hand = a.hand;
      f.side = a.side;
      f.variety = a.overCount;
      // a teammate to glance at: side players watch the captain, the captain looks from one to the other
      const pal = a.index === 0 ? this.actors[i + (Math.floor(time / 5.5) % 2 === 0 ? 1 : 2)] : this.actors[i - a.index];
      const p = pal ?? a;
      f.palX = p.x;
      f.palY = 1.2 * p.anim.sy + p.anim.lift;
      f.palZ = p.z;

      const an = a.anim;
      an.updateShow(f, a.fig.bones);
      const mesh = a.fig.mesh;
      mesh.visible = !an.hidden;
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, an.yaw);
      this.tmpV.set(an.px, an.py, an.pz);
      this.tmpS.set(an.sx, an.sy, an.sx);
      mesh.matrix.compose(this.tmpV, this.tmpQ, this.tmpS);
      mesh.matrixWorldNeedsUpdate = true;
      a.fig.setBaseY(an.py);

      // contact shadows: under each foot and the body, fading as they leave the floor
      const u = this.baseU[a.group];
      const sh = u.uShadows.value as Float32Array;
      let n = shadowN[a.group];
      if (!an.hidden) {
        const lift = an.lift;
        const fade = 1 - clamp01(lift / 1.6);
        if (n < SHADOWS) n = this.shadow(sh, n, an.px, an.pz - 0.02, (0.42 + 0.1 * lift) * an.sx * an.shadow, 0.5 * fade);
        for (let k = 0; k < 2; k++) {
          an.toWorld(an.ankles[k * 3], an.ankles[k * 3 + 1], an.ankles[k * 3 + 2] + 0.06, tw);
          const h = Math.max(0, an.ankles[k * 3 + 1] * an.sy + lift - 0.09);
          if (n < SHADOWS) n = this.shadow(sh, n, tw[0], tw[2], 0.2 * an.sx, 0.55 * (1 - clamp01(h / 0.4)));
        }
      }
      // the ball
      const ball = a.ball;
      if (ball) {
        ball.visible = !an.hidden;
        const w = an.spin;
        const rate = Math.hypot(w[0], w[1], w[2]);
        if (rate > 1e-4) {
          this.tmpA.set(w[0] / rate, w[1] / rate, w[2] / rate);
          this.tmpQ.setFromAxisAngle(this.tmpA, rate * dt);
          a.ballQ.premultiply(this.tmpQ);
          a.ballQ.normalize();
        }
        const sq = an.ballSquash;
        const by = an.ball[1] - BALL_R * (1 - sq);
        this.tmpV.set(an.ball[0], by, an.ball[2]);
        this.tmpS.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        ball.matrix.compose(this.tmpV, a.ballQ, this.tmpS);
        ball.matrixWorldNeedsUpdate = true;
        if (!an.hidden && n < SHADOWS) n = this.shadow(sh, n, an.ball[0] + 0.03 * by, an.ball[2] - 0.02 * by, 0.2 + 0.06 * by, 0.55 * (1 - clamp01((by - BALL_R) / 1.4)));
      }
      shadowN[a.group] = n;

      // screen box for taps: feet to the top of the head
      this.boxOf(a);
    }
    if (draw) this.three.render(this.scene, cam);
  }

  private shadow(sh: Float32Array, n: number, x: number, z: number, r: number, s: number): number {
    if (s <= 0.01) return n;
    sh[n * 4] = x;
    sh[n * 4 + 1] = z;
    sh[n * 4 + 2] = r;
    sh[n * 4 + 3] = s;
    return n + 1;
  }

  private boxOf(a: Actor): void {
    const an = a.anim;
    const b = a.box;
    b[0] = 1;
    b[1] = 1;
    b[2] = 0;
    b[3] = 0;
    const h = 1.6 * an.sy;
    for (let k = 0; k < 4; k++) {
      const dx = k % 2 === 0 ? -0.42 : 0.42;
      const y = an.py + (k < 2 ? 0 : h);
      this.tmpV.set(an.px + dx * an.sx, y, an.pz).project(this.camera);
      const x = this.tmpV.x * 0.5 + 0.5;
      const yy = 0.5 - this.tmpV.y * 0.5;
      b[0] = Math.min(b[0], x);
      b[2] = Math.max(b[2], x);
      b[1] = Math.min(b[1], yy);
      b[3] = Math.max(b[3], yy);
    }
  }

  /** Development: what each figure is doing. */
  describe(): { act: StageAct; t: number }[] {
    return this.actors.map((a) => ({ act: a.slot.act, t: a.over ? this.time - a.overStart : a.slot.t }));
  }

  dispose(): void {
    for (const a of this.actors) a.fig.dispose();
    for (const d of this.disposables) d.dispose();
    this.three.dispose();
  }
}

const tw = new Float64Array(3);

function vec(c: Rgb): THREE.Vector3 {
  return new THREE.Vector3(c[0], c[1], c[2]);
}
