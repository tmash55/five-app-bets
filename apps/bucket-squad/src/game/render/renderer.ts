/**
 * Draws a match: court, hoops, six animated figures, the ball and effects.
 *
 * The renderer only reads the simulation. The owner of the game loop calls
 * `beforeStep` / `afterStep` around every simulation tick and `render` once
 * per display frame, so drawing is smooth whatever the screen's refresh rate.
 */

import * as THREE from 'three';

import { hexToRgb, type Look } from '../kit/look';
import { BALL_R, COURT, DT, RULES } from '../sim/constants';
import { attackSign, shotApexTime, shotMeter } from '../sim/core';
import { clamp, clamp01, lerp, smooth } from '../sim/math';
import type { MatchState } from '../sim/types';
import { color, hot, party, sparkle } from '../../theme/tokens';
import { buildCourt, type CourtId, type CourtMeshes } from './court';
import { FigureView, newLightUniforms, type LightUniforms } from './figure';
import { rgb, type Rgb } from './geo';
import { Particles, SHAPE_SOFT, SHAPE_SPARKLE } from './particles';
import { CAM_FOV, MatchMotion } from './motion';
import { buildBallGeometry, programCount, warmUp, wrapContext } from './props';
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

const SHADOWS = 10;
const RINGS = 8;

const SPARK: Rgb[] = sparkle.map(rgb);
const PARTY: Rgb[] = party.map(rgb);
/** a hot streak: white-hot, gold, orange, hot pink */
const HOT: Rgb[] = hot.map(rgb);
/** the ring of light round a hot player dims and shrinks over the streak's last seconds */
const HOT_FADE = 3;
/** how fast the ring goes when an opponent's basket ends the streak (per second) */
const HOT_OUT = 4;
/** seconds the shockwave takes to roll out when a streak starts */
const SHOCK = 0.5;
/** seconds between dots of light behind a hot player's shot */
const HOT_TRAIL_EVERY = 0.012;
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
  /** fixed camera for photos and replays: eye, target and zoom (1 = normal) */
  photo: { eye: [number, number, number]; target: [number, number, number]; fov?: number } | null = null;

  private readonly three: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAM_FOV, 2, 2, 900);
  private readonly lights: LightUniforms = newLightUniforms();
  private readonly court: CourtMeshes;
  private readonly figures: FigureView[] = [];
  private readonly motion: MatchMotion;
  private readonly bones: Float32Array[] = [];
  private readonly particles = new Particles(520);
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
  // meter
  private meterHold = 0;
  private meterValue = 0;
  private meterGrade: Rgb = WHITE;
  private trailT = 0;
  private hotTrailT = 0;
  private stepT = new Float32Array(8);
  /** per player: how hot their ring is drawn (0..1), and seconds since their streak started */
  private readonly hotLv = new Float32Array(8);
  private readonly shockT = new Float32Array(8).fill(SHOCK);

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpS = new THREE.Vector3();

  constructor(gl: WebGL2RenderingContext, visuals: MatchVisuals) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    this.three = wrapContext(gl, false);
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
      uHot: { value: new Float32Array(RINGS * 4) },
      uHotCol: { value: new Float32Array(HOT.flat()) },
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
    const ballGeo = buildBallGeometry();
    this.ball = new THREE.Mesh(ballGeo, staticMat);
    this.ball.frustumCulled = false;
    this.scene.add(this.ball);
    this.disposables.push(ballGeo);

    // --- figures
    for (const look of visuals.looks) {
      const fig = new FigureView(look, L);
      this.figures.push(fig);
      this.bones.push(fig.bones);
      this.scene.add(fig.mesh);
    }
    this.motion = new MatchMotion(
      this.figures.map((f) => f.data.build),
      this.figures.map((f) => [f.data.hairPivotA, f.data.hairPivotB]),
    );

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

    this.resize(w, h);
    // every shader the match can ever use is built and queried now, never mid-game
    this.warmPrograms = warmUp(this.three, this.scene, this.camera);
  }

  /** Shader programs built before the first frame, and how many exist now (tooling: the two should stay equal). */
  readonly warmPrograms: number;

  get programs(): number {
    return programCount(this.three);
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

  /** how fast the match should run right now (slow motion on big moments) */
  get timeScale(): number {
    return this.motion.timeScale;
  }

  /** Remember where everything was, so the next frame can draw between ticks. */
  beforeStep(m: MatchState): void {
    this.motion.beforeStep(m);
  }

  /** React to what just happened in the simulation. */
  afterStep(m: MatchState): void {
    this.motion.afterStep(m);
    const P = this.particles;
    for (const e of m.events) {
      switch (e.type) {
        case 'jump': {
          const p = m.players[e.by];
          P.dust(p.x, p.z, 4, this.dustRgb, 0.8);
          break;
        }
        case 'land': {
          const p = m.players[e.by];
          P.dust(p.x, p.z, e.hard ? 8 : 4, this.dustRgb, e.hard ? 1.4 : 0.9);
          break;
        }
        case 'score': {
          const hoop = attackSign(e.team);
          const hi = hoop > 0 ? 1 : 0;
          const hx = hoop * COURT.hoopX;
          this.cheer = 1;
          const team = this.teamRgb[e.team];
          if (e.kind === 'dunk' || e.kind === 'oop') {
            this.rimSpring[hi].kick(e.kind === 'oop' ? 13 : 10);
            this.boardSpring[hi].kick(1.4);
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
        case 'fire': {
          const p = m.players[e.player];
          if (e.on) {
            // the ring lights with a shockwave across the floor (drawn by the floor), a ring of sparkles
            // skimming out with it and a burst off the player
            this.shockT[p.idx] = 0;
            for (let k = 0; k < 18; k++) {
              const ang = (k / 18) * Math.PI * 2 + P.rand() * 0.2;
              const sp = 5.5 + P.rand() * 1.5;
              P.spawn({
                x: p.x + Math.cos(ang) * 0.4,
                y: 0.12 + P.rand() * 0.1,
                z: p.z + Math.sin(ang) * 0.4,
                vx: Math.cos(ang) * sp,
                vy: 0.4 + P.rand() * 0.6,
                vz: Math.sin(ang) * sp,
                life: 0.38 + P.rand() * 0.14,
                size: 0.15 + P.rand() * 0.06,
                grow: 0.3,
                color: HOT[k % 2 === 0 ? 0 : 1 + Math.floor(P.rand() * 3)],
                drag: 3.2,
                spin: P.rand() * 3,
                spinV: (P.rand() - 0.5) * 6,
                shape: SHAPE_SPARKLE,
              });
            }
            P.burst(p.x, p.y + 1.1, p.z, 16, [WHITE, ...HOT], 4.4, 0.17);
            this.cheer = Math.max(this.cheer, 0.9);
          } else {
            // over: the last of the light pops off the ring
            P.burst(p.x, 0.3, p.z, 8, [HOT[1], HOT[3]], 1.8, 0.11);
          }
          break;
        }
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

  /**
   * Draw one frame.
   * @param alpha how far between the previous tick (0) and the latest (1) this frame sits
   * @param dt    real seconds since the last frame
   * @param draw  false to update the animation without drawing (fast-forward)
   */
  render(m: MatchState, alpha: number, dt: number, draw = true): void {
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    const a = clamp01(alpha);
    const ball = m.ball;
    const mo = this.motion;
    const photo = this.photo;
    mo.lookEye = photo ? photo.eye : null;
    mo.frame(m, a, dt, this.camera.aspect, this.bones);
    const cam = this.camera;
    if (photo) {
      cam.position.set(photo.eye[0], photo.eye[1], photo.eye[2]);
      this.tmpV.set(photo.target[0], photo.target[1], photo.target[2]);
    } else {
      cam.position.set(mo.cam.eye[0], mo.cam.eye[1], mo.cam.eye[2]);
      this.tmpV.set(mo.cam.target[0], mo.cam.target[1], mo.cam.target[2]);
    }
    const fov = photo?.fov ?? CAM_FOV;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.tmpV);
    cam.updateMatrixWorld();
    const scale = mo.timeScale;

    this.cheer = Math.max(0, this.cheer - dt * 0.55);
    this.staticU.uTime.value = this.time;
    this.staticU.uCheer.value = this.cheer;
    this.floorU.uTime.value = this.time;

    const shadows = this.floorU.uShadows.value as Float32Array;
    const rings = this.floorU.uRings.value as Float32Array;
    const ringCol = this.floorU.uRingCol.value as Float32Array;
    const hotRings = this.floorU.uHot.value as Float32Array;
    const sun = this.lights.uSunDir.value;
    const sox = -sun.x / Math.max(0.3, sun.y);
    const soz = -sun.z / Math.max(0.3, sun.y);
    const userTeam = m.cfg.userTeam;
    for (const p of m.players) {
      const i = p.idx;
      const o = i * 4;
      const x = mo.x[i];
      const y = mo.y[i];
      const z = mo.z[i];
      const fig = this.figures[i];
      const an = mo.anims[i];
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, an.yaw);
      this.tmpV.set(an.px, an.py, an.pz);
      this.tmpS.set(an.sx, an.sy, an.sx);
      fig.mesh.matrix.compose(this.tmpV, this.tmpQ, this.tmpS);
      fig.mesh.matrixWorldNeedsUpdate = true;
      fig.setBaseY(y);
      // a hot streak: its ring of light comes up fast, dims over the last seconds, and goes quickly when put out
      const want = p.fireT > 0 ? smooth(p.fireT / HOT_FADE) : 0;
      const lv = (this.hotLv[i] = want > this.hotLv[i] ? Math.min(want, this.hotLv[i] + dt * 6) : Math.max(want, this.hotLv[i] - dt * HOT_OUT));
      this.shockT[i] = Math.min(SHOCK, this.shockT[i] + dt * scale);
      // a hot glow (it wins over Hype's), or hype glow in team colour
      const hyped = m.hypeT[p.team] > 0;
      if (lv > 0.001) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5.5 + i * 1.7);
        const g = lv * (0.8 + 0.3 * pulse);
        const gold = HOT[1];
        const pink = HOT[3];
        const t = 0.2 + 0.25 * pulse;
        fig.setGlow(lerp(gold[0], pink[0], t) * g + 0.15 * lv, lerp(gold[1], pink[1], t) * g + 0.1 * lv, lerp(gold[2], pink[2], t) * g + 0.05 * lv);
      } else if (hyped) {
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
      hotRings[o] = lv;
      hotRings[o + 1] = this.shockT[i] < SHOCK ? 1 - this.shockT[i] / SHOCK : 0;
    }

    // --- ball: a held one is drawn where the holder's pose keeps it out of the head and the body
    const bx = mo.drawn.x;
    const by = mo.drawn.y;
    const bz = mo.drawn.z;
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

    // a hot player's shot trails a ribbon of light, with sparkles in it
    this.hotTrailT -= dt * scale;
    const hotShot = ball.state === 'shot' && ball.shooter >= 0 && this.hotLv[ball.shooter] > 0.05;
    while (hotShot && this.hotTrailT <= 0) {
      this.hotTrailT += HOT_TRAIL_EVERY;
      const P = this.particles;
      const glint = P.rand() < 0.3;
      // a little behind the ball, so the ball itself stays clear
      P.spawn({
        x: bx - ball.vx * 0.016 + (P.rand() - 0.5) * 0.08,
        y: by - ball.vy * 0.016 + (P.rand() - 0.5) * 0.08,
        z: bz - ball.vz * 0.016 + (P.rand() - 0.5) * 0.08,
        vx: (P.rand() - 0.5) * 0.3,
        vy: (P.rand() - 0.5) * 0.3,
        vz: (P.rand() - 0.5) * 0.3,
        life: glint ? 0.45 : 0.3 + P.rand() * 0.1,
        size: glint ? 0.2 : 0.15,
        grow: glint ? 0.4 : 0.15,
        color: glint ? HOT[P.rand() < 0.5 ? 0 : 3] : HOT[P.rand() < 0.5 ? 0 : 1],
        alpha: 0.9,
        spin: P.rand() * 3,
        spinV: glint ? (P.rand() - 0.5) * 8 : 0,
        shape: glint ? SHAPE_SPARKLE : SHAPE_SOFT,
      });
    }
    if (!hotShot) this.hotTrailT = 0;

    // sparkle trail when a team is in Hype, or behind a perfect shot
    this.trailT -= dt;
    const hypeTrail = !hotShot && ball.state !== 'dead' && (m.hypeT[m.possession] > 0 || (ball.state === 'shot' && ball.perfect));
    if (hypeTrail && this.trailT <= 0) {
      this.trailT = 0.03;
      const hyped = m.hypeT[m.possession] > 0;
      const c = hyped ? this.teamRgb[m.possession] : SPARK[1];
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
      const px = mo.x[ctrl.idx];
      const py = mo.y[ctrl.idx];
      const pz = mo.z[ctrl.idx];
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
      const px = mo.x[ctrl.idx];
      const py = mo.y[ctrl.idx];
      const pz = mo.z[ctrl.idx];
      this.arrow.visible = true;
      this.arrow.position.set(px, py + 1.95 * mo.anims[ctrl.idx].sy + 0.06 * Math.sin(this.time * 6), pz);
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
