/**
 * Draws a match: court, hoops, six animated figures, the ball and effects.
 *
 * The renderer only reads the simulation. The owner of the game loop calls
 * `beforeStep` / `afterStep` around every simulation tick and `render` once
 * per display frame, so drawing is smooth whatever the screen's refresh rate.
 */

import * as THREE from 'three';

import { KIT_SLOTS, getPart } from '../kit/kit';
import { hexToRgb, paletteFor, type Look } from '../kit/look';
import { BALL_R, COURT, DT, RULES } from '../sim/constants';
import { attackSign, hoopXOf, shotApexTime, shotMeter } from '../sim/core';
import { clamp, clamp01, lerp, smooth } from '../sim/math';
import type { MatchState, PlayerSim } from '../sim/types';
import { color, party, sparkle } from '../../theme/tokens';
import { FigureAnimator, type AnimFrame, type Mood } from './animator';
import { buildCourt, type CourtId, type CourtMeshes } from './court';
import { FigureView, newLightUniforms, type LightUniforms } from './figure';
import { rgb, type Rgb } from './geo';
import { Particles, SHAPE_SOFT, SHAPE_SPARKLE } from './particles';
import {
  ARROW_FRAG,
  FLOOR_FRAG,
  FLOOR_VERT,
  METER_FRAG,
  NET_FRAG,
  NET_VERT,
  SKY_FRAG,
  SKY_VERT,
  STATIC_FRAG,
  STATIC_VERT,
  UNLIT_VERT,
  WIPE_FRAG,
  WIPE_VERT,
} from './shaders';

export interface MatchVisuals {
  court: CourtId;
  /** one look per player, in simulation order */
  looks: Look[];
  /** main colour of each team: rings, arrows, sparkles, the wipe between plays */
  teamColors: [string, string];
}

const FOV = 22;
const PITCH = (15 * Math.PI) / 180;
const VIEW_H = 7.4;
const MIN_VIEW_W = 13.6;
const SHADOWS = 10;
const RINGS = 8;

const SPARK: Rgb[] = sparkle.map(rgb);
const PARTY: Rgb[] = party.map(rgb);
const WHITE = rgb(color.white);
const GRADE: Record<string, Rgb> = {
  perfect: rgb(color.perfect),
  good: rgb(color.good),
  ok: rgb(color.okay),
  bad: rgb(color.bad),
};

function v3(c: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(c[0], c[1], c[2]);
}

function hexV3(hex: string): THREE.Vector3 {
  return v3(hexToRgb(hex));
}

/** A spring that rings and settles: rim rattle, backboard shake. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private readonly k: number,
    private readonly d: number,
  ) {}
  kick(v: number): void {
    this.v += v;
  }
  step(dt: number): number {
    this.v += (-this.x * this.k - this.v * this.d) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class MatchRenderer {
  /** how fast the match should run right now (slow motion on big moments) */
  timeScale = 1;
  /** fixed camera for photos and replays: eye, target and zoom (1 = normal) */
  photo: { eye: [number, number, number]; target: [number, number, number]; fov?: number } | null = null;

  private readonly three: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 2, 2, 900);
  private readonly lights: LightUniforms = newLightUniforms();
  private readonly court: CourtMeshes;
  private readonly figures: FigureView[] = [];
  private readonly anims: FigureAnimator[] = [];
  private readonly particles = new Particles(360);
  private readonly ball: THREE.Mesh;
  private readonly ballQuat = new THREE.Quaternion();
  private readonly sky: THREE.Mesh;
  private readonly floorU: Record<string, THREE.IUniform>;
  private readonly staticU: Record<string, THREE.IUniform>;
  private readonly netU: Record<string, THREE.IUniform>[] = [];
  private readonly rimGroups: THREE.Group[] = [];
  private readonly boardGroups: THREE.Group[] = [];
  private readonly rimSpring = [new Spring(520, 9), new Spring(520, 9)];
  private readonly boardSpring = [new Spring(900, 14), new Spring(900, 14)];
  private readonly meter: THREE.Mesh;
  private readonly meterU: Record<string, THREE.IUniform>;
  private readonly arrow: THREE.Mesh;
  private readonly arrowU: Record<string, THREE.IUniform>;
  private readonly wipe: THREE.Mesh;
  private readonly wipeU: Record<string, THREE.IUniform>;
  private readonly teamRgb: [Rgb, Rgb];
  private readonly dustRgb: Rgb;
  private readonly disposables: { dispose(): void }[] = [];

  private width = 1;
  private height = 1;
  private time = 0;
  private cheer = 0;
  // camera state
  private fx = 0;
  private fxV = 0;
  private fy = 1;
  private fz = 0;
  private zoom = 1.5;
  private shake = 0;
  private intro = 1;
  private slowT = 0;
  // interpolation
  private readonly prev: Float32Array;
  private readonly prevBall = new Float32Array(3);
  private synced = false;
  // meter
  private meterHold = 0;
  private meterValue = 0;
  private meterGrade: Rgb = WHITE;
  private trailT = 0;
  private stepT = new Float32Array(8);

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpS = new THREE.Vector3();
  private readonly frame: AnimFrame;

  constructor(gl: WebGL2RenderingContext, visuals: MatchVisuals) {
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
    this.three = new THREE.WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.three.setPixelRatio(1);
    this.three.setClearColor(0x000000, 1);
    this.three.sortObjects = true;
    this.scene.matrixAutoUpdate = false;

    const court = (this.court = buildCourt(visuals.court));
    const th = court.theme;
    this.teamRgb = [rgb(visuals.teamColors[0]), rgb(visuals.teamColors[1])];
    this.dustRgb = rgb(th.dust);
    const L = this.lights;
    L.uSunDir.value.set(th.light.dir[0], th.light.dir[1], th.light.dir[2]).normalize();
    L.uSunCol.value.fromArray(th.light.sun);
    L.uSkyCol.value.fromArray(th.light.sky);
    L.uGroundCol.value.fromArray(th.light.ground);
    L.uRimCol.value.fromArray(th.light.rim);
    const fogCol = hexV3(th.fog.color);

    // --- sky
    const skyGeo = new THREE.SphereGeometry(700, 24, 12);
    const skyMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTop: { value: hexV3(th.sky.top) },
        uHorizon: { value: hexV3(th.sky.horizon) },
        uSunDir: { value: new THREE.Vector3(-0.45, 0.3, -0.84).normalize() },
        uSunGlow: { value: hexV3(th.sky.glow) },
      },
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.disposables.push(skyGeo, skyMat);

    // --- floor
    this.floorU = {
      uCourtCol: { value: hexV3(th.floor.court) },
      uCourtCol2: { value: hexV3(th.floor.court2) },
      uKeyCol: { value: hexV3(th.floor.key) },
      uLineCol: { value: hexV3(th.floor.line) },
      uCircleCol: { value: hexV3(th.floor.circle) },
      uApronCol: { value: hexV3(th.floor.apron) },
      uOutCol: { value: hexV3(th.floor.out) },
      uOutCol2: { value: hexV3(th.floor.out2) },
      uFogCol: { value: fogCol },
      uFogNear: { value: th.fog.near },
      uFogFar: { value: th.fog.far },
      uStripes: { value: th.floor.stripes },
      uCourt: { value: new THREE.Vector4(COURT.halfL, COURT.halfW, COURT.hoopX, COURT.threeR) },
      uCourt2: { value: new THREE.Vector4(COURT.cornerZ, COURT.keyHalfW, COURT.ftDist, COURT.centreR) },
      uShadows: { value: new Float32Array(SHADOWS * 4) },
      uRings: { value: new Float32Array(RINGS * 4) },
      uRingCol: { value: new Float32Array(RINGS * 3) },
      uTime: { value: 0 },
    };
    const floorMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: this.floorU,
    });
    const floor = new THREE.Mesh(court.floor, floorMat);
    floor.frustumCulled = false;
    floor.renderOrder = -5;
    this.scene.add(floor);
    this.disposables.push(court.floor, floorMat);

    // --- scenery, hoops, ball share one lit material setup
    this.staticU = {
      ...L,
      uFogCol: { value: fogCol },
      uFogNear: { value: th.fog.near },
      uFogFar: { value: th.fog.far },
      uUnlit: { value: 0 },
      uTime: { value: 0 },
      uCheer: { value: 0 },
    };
    const staticMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: STATIC_VERT,
      fragmentShader: STATIC_FRAG,
      uniforms: this.staticU,
    });
    this.disposables.push(staticMat);
    const scenery = new THREE.Mesh(court.scenery, staticMat);
    scenery.frustumCulled = false;
    this.scene.add(scenery);
    this.disposables.push(court.scenery);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const boardG = new THREE.Group();
      boardG.position.set(side * COURT.boardX, (COURT.boardY0 + COURT.boardY1) / 2, 0);
      boardG.add(new THREE.Mesh(court.boards[i], staticMat));
      this.scene.add(boardG);
      this.boardGroups.push(boardG);
      const rimG = new THREE.Group();
      rimG.position.set(side * COURT.boardX, COURT.rimY, 0);
      rimG.add(new THREE.Mesh(court.rims[i], staticMat));
      const netU = {
        uSwish: { value: 99 },
        uTime: { value: 0 },
        uColor: { value: hexV3(th.hoop.net) },
      };
      const netMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: NET_VERT,
        fragmentShader: NET_FRAG,
        uniforms: netU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const net = new THREE.Mesh(court.net, netMat);
      net.position.set(-side * (COURT.boardX - COURT.hoopX), -0.02, 0);
      net.renderOrder = 2;
      rimG.add(net);
      this.scene.add(rimG);
      this.rimGroups.push(rimG);
      this.netU.push(netU);
      this.disposables.push(court.boards[i], court.rims[i], netMat);
    }
    this.disposables.push(court.net);

    // --- ball
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
    this.ball = new THREE.Mesh(ballGeo, staticMat);
    this.ball.frustumCulled = false;
    this.scene.add(this.ball);
    this.disposables.push(ballGeo);

    // --- figures
    visuals.looks.forEach((look, i) => {
      const fig = new FigureView(look, L);
      this.figures.push(fig);
      this.anims.push(new FigureAnimator(fig.data.build, fig.data.hairPivotA, fig.data.hairPivotB, i * 3 + 1));
      this.scene.add(fig.mesh);
    });
    const n = visuals.looks.length;
    this.prev = new Float32Array(n * 4);

    this.scene.add(this.particles.mesh);

    // --- overlays in the world: shot meter and the "you" arrow
    const quad = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(quad);
    this.meterU = {
      uValue: { value: 0 },
      uPerfect: { value: 0.15 },
      uGood: { value: 0.3 },
      uInk: { value: hexV3(color.ink) },
      uFill: { value: hexV3(color.white) },
      uPerfectCol: { value: hexV3(color.perfect) },
      uGoodCol: { value: hexV3(color.good) },
    };
    const meterMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: UNLIT_VERT,
      fragmentShader: METER_FRAG,
      uniforms: this.meterU,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.meter = new THREE.Mesh(quad, meterMat);
    this.meter.renderOrder = 20;
    this.meter.visible = false;
    this.meter.frustumCulled = false;
    this.scene.add(this.meter);
    this.arrowU = { uColor: { value: hexV3(color.sun) }, uInk: { value: hexV3(color.ink) } };
    const arrowMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: UNLIT_VERT,
      fragmentShader: ARROW_FRAG,
      uniforms: this.arrowU,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.arrow = new THREE.Mesh(quad, arrowMat);
    this.arrow.renderOrder = 19;
    this.arrow.visible = false;
    this.arrow.frustumCulled = false;
    this.scene.add(this.arrow);

    // --- wipe between plays
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.wipeU = {
      uCover: { value: 0 },
      uDir: { value: 1 },
      uAspect: { value: 2 },
      uColA: { value: hexV3(visuals.teamColors[0]) },
      uColB: { value: hexV3(visuals.teamColors[1]) },
    };
    const wipeMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: WIPE_VERT,
      fragmentShader: WIPE_FRAG,
      uniforms: this.wipeU,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.wipe = new THREE.Mesh(tri, wipeMat);
    this.wipe.renderOrder = 50;
    this.wipe.frustumCulled = false;
    this.wipe.visible = false;
    this.scene.add(this.wipe);
    this.disposables.push(tri, meterMat, arrowMat, wipeMat);

    this.frame = {
      m: null as unknown as MatchState,
      p: null as unknown as PlayerSim,
      x: 0,
      y: 0,
      z: 0,
      facing: 0,
      bx: 0,
      by: 0,
      bz: 0,
      camX: 0,
      camY: 6,
      camZ: 20,
      dt: 0,
      lag: 0,
      time: 0,
      mood: 'play',
    };
    this.resize(w, h);
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.three.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.wipeU.uAspect.value = this.camera.aspect;
  }

  /** Remember where everything was, so the next frame can draw between ticks. */
  beforeStep(m: MatchState): void {
    this.synced = true;
    const pv = this.prev;
    for (const p of m.players) {
      const o = p.idx * 4;
      pv[o] = p.x;
      pv[o + 1] = p.y;
      pv[o + 2] = p.z;
      pv[o + 3] = p.facing;
    }
    this.prevBall[0] = m.ball.x;
    this.prevBall[1] = m.ball.y;
    this.prevBall[2] = m.ball.z;
  }

  /** React to what just happened in the simulation. */
  afterStep(m: MatchState): void {
    const P = this.particles;
    for (const e of m.events) {
      switch (e.type) {
        case 'jump': {
          const p = m.players[e.by];
          this.anims[e.by].impulse(1.5);
          P.dust(p.x, p.z, 4, this.dustRgb, 0.8);
          break;
        }
        case 'land': {
          const p = m.players[e.by];
          this.anims[e.by].impulse(e.hard ? -2.6 : -1.5);
          P.dust(p.x, p.z, e.hard ? 8 : 4, this.dustRgb, e.hard ? 1.4 : 0.9);
          break;
        }
        case 'dunkStart':
          this.anims[e.by].impulse(2);
          break;
        case 'score': {
          const hoop = attackSign(e.team);
          const hi = hoop > 0 ? 1 : 0;
          const hx = hoop * COURT.hoopX;
          this.cheer = 1;
          const team = this.teamRgb[e.team];
          if (e.kind === 'dunk' || e.kind === 'oop') {
            this.rimSpring[hi].kick(e.kind === 'oop' ? 13 : 10);
            this.boardSpring[hi].kick(1.4);
            this.shake = Math.max(this.shake, e.kind === 'oop' ? 0.5 : 0.36);
            this.slowT = 0.16;
            P.burst(hx, COURT.rimY - 0.1, 0, e.kind === 'oop' ? 30 : 20, [team, ...SPARK], 5.5, 0.2);
          } else {
            this.rimSpring[hi].kick(e.perfect ? 1.2 : 2.6);
            P.burst(hx, COURT.rimY - 0.3, 0, e.points === 3 ? 16 : 8, e.perfect ? SPARK : [team, WHITE], e.points === 3 ? 4 : 3, 0.15);
          }
          if (e.buzzer) P.confetti(hx, COURT.rimY + 0.6, 0, 60, PARTY, 3.4);
          break;
        }
        case 'rim':
          this.rimSpring[e.hoop > 0 ? 1 : 0].kick(clamp(e.speed * 0.55, 0.6, 4));
          break;
        case 'board':
          this.boardSpring[e.hoop > 0 ? 1 : 0].kick(clamp(e.speed * 0.12, 0.2, 1));
          break;
        case 'shot':
          if (e.by === m.control) {
            const p = m.players[e.by];
            this.meterHold = 0.55;
            this.meterValue = 1 + p.relErr / shotApexTime();
            this.meterGrade = GRADE[e.grade];
          }
          if (e.grade === 'perfect') {
            const p = m.players[e.by];
            P.burst(p.x, p.y + 1.7, p.z, 8, SPARK, 2.4, 0.13);
          }
          break;
        case 'steal': {
          const p = m.players[e.by];
          P.burst(p.x, 0.9, p.z, 10, [this.teamRgb[p.team], WHITE], 3, 0.13);
          this.cheer = Math.max(this.cheer, 0.6);
          break;
        }
        case 'block': {
          P.burst(m.ball.x, m.ball.y, m.ball.z, 14, [this.teamRgb[m.players[e.by].team], ...SPARK], 4.5, 0.17);
          this.shake = Math.max(this.shake, e.stuffed ? 0.4 : 0.22);
          this.cheer = Math.max(this.cheer, 0.8);
          break;
        }
        case 'ankle': {
          const v = m.players[e.victim];
          P.dust(v.x, v.z, 12, this.dustRgb, 1.6);
          this.cheer = Math.max(this.cheer, 0.7);
          break;
        }
        case 'poster': {
          const v = m.players[e.victim];
          P.dust(v.x, v.z, 10, this.dustRgb, 1.5);
          break;
        }
        case 'hype':
          if (e.on) {
            for (const p of m.players) {
              if (p.team === e.team) P.burst(p.x, p.y + 1, p.z, 14, [this.teamRgb[e.team], ...SPARK], 4.2, 0.18);
            }
            this.cheer = 1;
          }
          break;
        case 'inbound':
          for (const a of this.anims) a.reset();
          break;
        case 'period':
          if (e.start) {
            for (const a of this.anims) a.reset();
          }
          break;
        case 'final': {
          this.cheer = 1;
          for (let k = 0; k < 5; k++) P.confetti(-8 + k * 4, 5.5, -2 + (k % 2) * 3, 34, PARTY, 4);
          break;
        }
        default:
          break;
      }
    }
    // shoe dust from hard running
    for (const p of m.players) {
      if (p.state !== 'free' || !p.sprinting) continue;
      this.stepT[p.idx] -= DT;
      if (this.stepT[p.idx] <= 0) {
        this.stepT[p.idx] = 0.14;
        P.dust(p.x - p.vx * 0.04, p.z - p.vz * 0.04, 1, this.dustRgb, 0.5);
      }
    }
  }

  private moodOf(m: MatchState, p: PlayerSim): Mood {
    switch (m.phase) {
      case 'final':
        return m.winner === p.team ? 'win' : 'lose';
      case 'scored': {
        const s = m.lastScoreBy;
        if (s < 0) return 'play';
        if (p.idx === s) return 'celebrate';
        return m.players[s].team === p.team ? 'cheer' : 'sad';
      }
      case 'periodEnd':
        return m.score[p.team] > m.score[1 - p.team] ? 'cheer' : m.score[p.team] < m.score[1 - p.team] ? 'sad' : 'ready';
      case 'countdown':
      case 'inbound':
        return 'ready';
      default:
        return 'play';
    }
  }

  private updateCamera(m: MatchState, bx: number, by: number, bz: number, dt: number): void {
    const cam = this.camera;
    const ball = m.ball;
    const s = attackSign(m.possession);
    let dunker: PlayerSim | null = null;
    for (const p of m.players) {
      if (p.state === 'dunk' || p.state === 'oop' || p.state === 'hang') dunker = p;
    }
    let tx = bx + s * 1.5;
    let ty = 1.0 + clamp((by - 3.4) * 0.28, 0, 1.3);
    let tz = bz * 0.06;
    let tZoom = 1 + clamp((by - 4.2) * 0.03, 0, 0.1);
    if (ball.state === 'shot') tx = lerp(bx, hoopXOf(ball.shotTeam), 0.55);
    if (m.phase === 'countdown' || m.phase === 'inbound') tx = bx + s * 2.6;
    if (dunker) {
      tx = hoopXOf(dunker.team) - attackSign(dunker.team) * 1.4;
      ty = 1.55;
      tZoom = 0.84;
    }
    if (m.phase === 'final' && m.winner >= 0) {
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const p of m.players) {
        if (p.team === m.winner) {
          cx += p.x;
          cz += p.z;
          n++;
        }
      }
      tx = cx / n;
      tz = (cz / n) * 0.3;
      tZoom = 0.86;
    }
    const aspect = cam.aspect;
    const viewH = Math.max(VIEW_H, MIN_VIEW_W / aspect);
    const limit = Math.max(0, COURT.halfL + 2.1 - (viewH * this.zoom * aspect) / 2);
    tx = clamp(tx, -limit, limit);
    // critically damped follow
    const w = 4.4;
    this.fxV += ((tx - this.fx) * w * w - 2 * w * this.fxV) * dt;
    this.fx += this.fxV * dt;
    this.fy += (ty - this.fy) * Math.min(1, dt * 3.5);
    this.fz += (tz - this.fz) * Math.min(1, dt * 3);
    this.intro = Math.max(0, this.intro - dt / 2.6);
    const io = this.intro * this.intro * (3 - 2 * this.intro);
    this.zoom += (tZoom + 0.5 * io - this.zoom) * Math.min(1, dt * (dunker ? 6 : 3));
    const dist = ((viewH * this.zoom) / 2 / Math.tan((FOV * Math.PI) / 360)) * 1;
    const pitch = PITCH + 0.2 * io;
    // shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    const sxo = Math.sin(this.time * 71) * sh * 0.5;
    const syo = Math.cos(this.time * 83) * sh * 0.5;
    cam.position.set(this.fx * 0.94 + sxo, this.fy + dist * Math.sin(pitch) + syo, this.fz + dist * Math.cos(pitch));
    this.tmpV.set(this.fx + sxo * 0.5, this.fy + syo * 0.5, this.fz);
    const photo = this.photo;
    const fov = photo?.fov ?? FOV;
    if (photo) {
      cam.position.set(photo.eye[0], photo.eye[1], photo.eye[2]);
      this.tmpV.set(photo.target[0], photo.target[1], photo.target[2]);
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.tmpV);
    cam.updateMatrixWorld();
  }

  /**
   * Draw one frame.
   * @param alpha how far between the previous tick (0) and the latest (1) this frame sits
   * @param dt    real seconds since the last frame
   * @param draw  false to update the animation without drawing (fast-forward)
   */
  render(m: MatchState, alpha: number, dt: number, draw = true): void {
    if (!this.synced) this.beforeStep(m);
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    const a = clamp01(alpha);
    const ball = m.ball;
    let bx = lerp(this.prevBall[0], ball.x, a);
    let by = lerp(this.prevBall[1], ball.y, a);
    let bz = lerp(this.prevBall[2], ball.z, a);
    if (Math.abs(ball.x - this.prevBall[0]) + Math.abs(ball.z - this.prevBall[2]) > 3) {
      bx = ball.x;
      by = ball.y;
      bz = ball.z;
    }
    this.updateCamera(m, bx, by, bz, dt);
    const cam = this.camera;

    // slow motion for the big moments
    this.slowT = Math.max(0, this.slowT - dt);
    let scale = this.slowT > 0 ? 0.4 : 1;
    for (const p of m.players) {
      if ((p.state === 'dunk' || p.state === 'oop') && p.t / Math.max(0.01, p.dur) > 0.72) scale = Math.min(scale, 0.5);
    }
    this.timeScale = scale;

    this.cheer = Math.max(0, this.cheer - dt * 0.55);
    this.staticU.uTime.value = this.time;
    this.staticU.uCheer.value = this.cheer;
    this.floorU.uTime.value = this.time;

    const shadows = this.floorU.uShadows.value as Float32Array;
    const rings = this.floorU.uRings.value as Float32Array;
    const ringCol = this.floorU.uRingCol.value as Float32Array;
    const sun = this.lights.uSunDir.value;
    const sox = -sun.x / Math.max(0.3, sun.y);
    const soz = -sun.z / Math.max(0.3, sun.y);
    const f = this.frame;
    f.m = m;
    f.bx = bx;
    f.by = by;
    f.bz = bz;
    f.camX = cam.position.x;
    f.camY = cam.position.y;
    f.camZ = cam.position.z;
    f.dt = dt * scale;
    f.lag = (1 - a) * DT;
    f.time = this.time;
    const userTeam = m.cfg.userTeam;
    for (const p of m.players) {
      const i = p.idx;
      const o = i * 4;
      const pv = this.prev;
      let x = lerp(pv[o], p.x, a);
      let y = lerp(pv[o + 1], p.y, a);
      let z = lerp(pv[o + 2], p.z, a);
      let d = p.facing - pv[o + 3];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      let facing = pv[o + 3] + d * a;
      if (Math.abs(p.x - pv[o]) + Math.abs(p.z - pv[o + 2]) > 2) {
        x = p.x;
        y = p.y;
        z = p.z;
        facing = p.facing;
      }
      f.p = p;
      f.x = x;
      f.y = y;
      f.z = z;
      f.facing = facing;
      f.mood = this.moodOf(m, p);
      const fig = this.figures[i];
      const an = this.anims[i];
      an.update(f, fig.bones);
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, an.yaw);
      this.tmpV.set(an.px, an.py, an.pz);
      this.tmpS.set(an.sx, an.sy, an.sx);
      fig.mesh.matrix.compose(this.tmpV, this.tmpQ, this.tmpS);
      fig.mesh.matrixWorldNeedsUpdate = true;
      fig.setBaseY(y);
      // hype glow in team colour
      const hot = m.hypeT[p.team] > 0;
      if (hot) {
        const c = this.teamRgb[p.team];
        const pulse = 0.45 + 0.2 * Math.sin(this.time * 9 + i);
        fig.setGlow(c[0] * pulse + 0.25, c[1] * pulse + 0.25, c[2] * pulse + 0.2);
      } else {
        fig.setGlow(0, 0, 0);
      }
      // shadow
      const fade = 1 - clamp(y / 3.2, 0, 0.6);
      shadows[o] = x + sox * (0.1 + y * 0.5);
      shadows[o + 1] = z + soz * (0.1 + y * 0.5);
      shadows[o + 2] = 0.66 * an.sx * an.shadow * (1 + y * 0.1);
      shadows[o + 3] = 0.8 * fade;
      // ring for the person's own team
      const mine = userTeam >= 0 && p.team === userTeam;
      const you = i === m.control;
      rings[o] = x;
      rings[o + 1] = z;
      rings[o + 2] = you ? 0.62 + 0.03 * Math.sin(this.time * 7) : 0.52;
      rings[o + 3] = you ? 1 : mine ? 0.32 : 0;
      const tc = this.teamRgb[p.team];
      ringCol[i * 3] = you ? Math.min(1, tc[0] * 0.5 + 0.6) : tc[0];
      ringCol[i * 3 + 1] = you ? Math.min(1, tc[1] * 0.5 + 0.6) : tc[1];
      ringCol[i * 3 + 2] = you ? Math.min(1, tc[2] * 0.5 + 0.6) : tc[2];
    }

    // --- ball
    const bm = this.ball;
    let ax = 0;
    let az = 0;
    let rate = 0;
    const bs = Math.hypot(ball.vx, ball.vz);
    if (bs > 0.05) {
      // roll forward on the floor and in the hand, backspin on a shot
      const back = ball.state === 'shot' ? -1 : 1;
      ax = (back * ball.vz) / bs;
      az = (-back * ball.vx) / bs;
      rate = ball.state === 'shot' ? 9 : ball.state === 'pass' ? 6 : Math.min(26, bs / BALL_R) * (ball.state === 'held' ? 0.35 : 1);
    }
    if (rate > 0) {
      this.tmpQ.setFromAxisAngle(this.tmpV.set(ax, 0, az), rate * dt * scale);
      this.ballQuat.premultiply(this.tmpQ);
    }
    const squash = ball.state === 'held' && by < BALL_R + 0.06 ? 0.9 : 1;
    this.tmpV.set(bx, by, bz);
    this.tmpS.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    bm.matrix.compose(this.tmpV, this.ballQuat, this.tmpS);
    bm.matrixAutoUpdate = false;
    bm.matrixWorldNeedsUpdate = true;
    const so = 6 * 4;
    const bFade = 1 - clamp(by / 7, 0, 0.75);
    shadows[so] = bx + sox * by * 0.4;
    shadows[so + 1] = bz + soz * by * 0.4;
    shadows[so + 2] = 0.24 + by * 0.04;
    shadows[so + 3] = 0.78 * bFade;

    // sparkle trail when a team is in Hype, or behind a perfect shot
    this.trailT -= dt;
    const hypeTrail = ball.state !== 'dead' && (m.hypeT[m.possession] > 0 || (ball.state === 'shot' && ball.perfect));
    if (hypeTrail && this.trailT <= 0) {
      this.trailT = 0.03;
      const hot = m.hypeT[m.possession] > 0;
      const c = hot ? this.teamRgb[m.possession] : SPARK[1];
      this.particles.spawn({
        x: bx + (this.particles.rand() - 0.5) * 0.15,
        y: by + (this.particles.rand() - 0.5) * 0.15,
        z: bz,
        life: 0.38,
        size: 0.14,
        grow: 0.2,
        color: this.particles.rand() < 0.5 ? c : SPARK[0],
        shape: this.particles.rand() < 0.6 ? SHAPE_SPARKLE : SHAPE_SOFT,
        alpha: 0.9,
        spin: this.particles.rand() * 3,
      });
    }
    this.particles.update(dt * scale);

    // --- hoops
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const r = this.rimSpring[i].step(dt);
      // the rim dips toward the court when it is hit
      this.rimGroups[i].rotation.z = -side * clamp(r * 0.012, -0.3, 0.3);
      const bsx = this.boardSpring[i].step(dt);
      this.boardGroups[i].position.x = side * COURT.boardX + bsx * 0.012;
      this.boardGroups[i].rotation.z = bsx * 0.004;
      this.netU[i].uSwish.value = m.lastScoreT[i];
      this.netU[i].uTime.value = this.time;
    }

    // --- shot meter beside the shooter, arrow over the controlled player
    this.meterHold = Math.max(0, this.meterHold - dt);
    const sm = shotMeter(m);
    const ctrl = m.control >= 0 ? m.players[m.control] : null;
    if (ctrl && (sm || this.meterHold > 0)) {
      const o = ctrl.idx * 4;
      const px = lerp(this.prev[o], ctrl.x, a);
      const py = lerp(this.prev[o + 1], ctrl.y, a);
      const pz = lerp(this.prev[o + 2], ctrl.z, a);
      this.meter.visible = true;
      this.tmpV.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const sideSign = attackSign(ctrl.team) > 0 ? -1 : 1;
      this.meter.position.set(px + this.tmpV.x * 0.95 * sideSign, py + 1.0, pz + this.tmpV.z * 0.95 * sideSign);
      this.meter.quaternion.copy(cam.quaternion);
      const pop = this.meterHold > 0 && !sm ? 1 + 0.25 * smooth((this.meterHold - 0.4) / 0.15) : 1;
      this.meter.scale.set(0.26 * pop, 1.04 * pop, 1);
      if (sm) {
        this.meterU.uValue.value = sm.value;
        this.meterU.uPerfect.value = sm.perfect;
        this.meterU.uGood.value = sm.good;
        (this.meterU.uFill.value as THREE.Vector3).set(1, 1, 1);
      } else {
        this.meterU.uValue.value = this.meterValue;
        (this.meterU.uFill.value as THREE.Vector3).fromArray(this.meterGrade as unknown as number[]);
      }
    } else {
      this.meter.visible = false;
    }
    if (ctrl && m.phase !== 'final') {
      const o = ctrl.idx * 4;
      const px = lerp(this.prev[o], ctrl.x, a);
      const py = lerp(this.prev[o + 1], ctrl.y, a);
      const pz = lerp(this.prev[o + 2], ctrl.z, a);
      this.arrow.visible = true;
      this.arrow.position.set(px, py + 1.95 * this.anims[ctrl.idx].sy + 0.06 * Math.sin(this.time * 6), pz);
      this.arrow.quaternion.copy(cam.quaternion);
      this.arrow.scale.set(0.42, 0.42, 1);
    } else {
      this.arrow.visible = false;
    }

    // --- wipe between plays
    let cover = 0;
    let dir = 1;
    const closeT = 0.26;
    const openT = 0.3;
    if (m.phase === 'scored' || m.phase === 'whistle' || m.phase === 'periodEnd') {
      const total = m.phase === 'scored' ? RULES.scoredPause : m.phase === 'whistle' ? RULES.whistlePause : RULES.periodPause;
      cover = smooth((m.phaseT - (total - closeT)) / closeT);
    } else if (m.phase === 'inbound') {
      cover = 1 - smooth(m.phaseT / openT);
      dir = -1;
    } else if (m.phase === 'countdown' && m.quarter > 1) {
      cover = 1 - smooth((m.phaseT - (RULES.countdown - 1.6)) / openT);
      dir = -1;
    }
    this.wipe.visible = cover > 0.001;
    this.wipeU.uCover.value = cover;
    this.wipeU.uDir.value = dir;

    this.sky.position.copy(cam.position);
    this.sky.updateMatrix();
    if (draw) this.three.render(this.scene, cam);
  }

  /** Screen position (0..1 from the top left) of a point in the world, for callouts drawn by the HUD. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): void {
    this.tmpV.set(x, y, z).project(this.camera);
    out.x = this.tmpV.x * 0.5 + 0.5;
    out.y = 0.5 - this.tmpV.y * 0.5;
  }

  dispose(): void {
    for (const f of this.figures) f.dispose();
    this.particles.dispose();
    for (const d of this.disposables) d.dispose();
    this.three.dispose();
  }
}
