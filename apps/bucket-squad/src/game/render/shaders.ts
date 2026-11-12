/**
 * GLSL for the match scene. Everything is drawn with small hand-written
 * shaders and vertex colours: no textures, no lights from the engine. That
 * keeps the look consistent (soft, matte, sunny) and keeps it cheap on phones.
 */

import { BONE_COUNT } from '../kit/kit';

const LIGHTING = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uRimCol;

vec3 shadeMatte(vec3 base, vec3 n, vec3 v) {
  float ndl = dot(n, uSunDir);
  // a soft terminator: no hard shadow line, no highlight
  float lit = smoothstep(-0.32, 0.62, ndl);
  vec3 amb = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  vec3 c = base * (uSunCol * lit + amb);
  // shadows drift a little toward the sky colour, like a painted cartoon
  c = mix(c, c * vec3(0.92, 0.96, 1.08), (1.0 - lit) * 0.5);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  c += base * uRimCol * fres * (0.3 + 0.7 * max(n.y, 0.0));
  return c;
}
`;

export const FIGURE_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 uBones[${BONE_COUNT}];
uniform float uDecalBias;
in vec3 position;
in vec3 normal;
in vec4 color;      // rgb + decal layer (0 = solid surface)
in float bone;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
void main() {
  mat4 b = uBones[int(bone + 0.5)];
  vec4 world = modelMatrix * (b * vec4(position, 1.0));
  vNormal = mat3(modelMatrix) * (mat3(b) * normal);
  vColor = color.rgb;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  // painted details (eyes, mouth, numbers) win the depth test against the skin under them
  gl_Position.z -= color.a * uDecalBias * gl_Position.w;
}
`;

export const FIGURE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cameraPosition;
uniform float uFlash;
uniform vec3 uGlow;
uniform float uBaseY;
${LIGHTING}
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 c = shadeMatte(vColor, n, v);
  // feet sit in their own shadow
  c *= mix(0.8, 1.0, smoothstep(0.0, 0.3, vWorld.y - uBaseY));
  // hype glow hugs the silhouette
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  c += uGlow * fres;
  c = mix(c, vec3(1.0), uFlash);
  fragColor = vec4(c, 1.0);
}
`;

/** Static scenery and props: same lighting, no bones. */
export const STATIC_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uCheer;
in vec3 position;
in vec3 normal;
in vec3 color;
in vec3 anim;       // phase, bounce height (crowd), sway (leaves)
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
void main() {
  vec3 p = position;
  // the crowd bobs all the time and jumps when something happens
  p.y += anim.y * (0.2 + 0.8 * uCheer) * abs(sin(uTime * (2.6 + 4.4 * uCheer) + anim.x));
  p.x += anim.z * sin(uTime * 1.3 + anim.x) * (0.4 + 0.1 * p.y);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vNormal = mat3(modelMatrix) * normal;
  vColor = color;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const STATIC_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cameraPosition;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uUnlit;
${LIGHTING}
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  vec3 c = mix(shadeMatte(vColor, n, normalize(toCam)), vColor, uUnlit);
  float fog = smoothstep(uFogNear, uFogFar, length(toCam));
  fragColor = vec4(mix(c, uFogCol, fog), 1.0);
}
`;

/**
 * The ground: court markings are drawn analytically so the lines stay crisp
 * at any zoom, and the soft shadows and team rings under the players are part
 * of the same pass.
 */
export const FLOOR_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in float shade;
out vec3 vWorld;
out float vShade;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vShade = shade;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const FLOOR_FRAG = /* glsl */ `
precision highp float;
#define SHADOWS 10
#define RINGS 8
uniform vec3 cameraPosition;
uniform vec3 uCourtCol;
uniform vec3 uCourtCol2;
uniform vec3 uKeyCol;
uniform vec3 uLineCol;
uniform vec3 uCircleCol;
uniform vec3 uApronCol;
uniform vec3 uOutCol;
uniform vec3 uOutCol2;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uStripes;
uniform vec4 uCourt;      // halfL, halfW, hoopX, threeR
uniform vec4 uCourt2;     // cornerZ, keyHalfW, ftDist, centreR
uniform vec4 uShadows[SHADOWS];  // x, z, radius, strength
uniform vec4 uRings[RINGS];      // x, z, radius, alpha
uniform vec3 uRingCol[RINGS];
uniform float uTime;
in vec3 vWorld;
in float vShade;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float stroke(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}

void main() {
  vec2 p = vWorld.xz;
  float halfL = uCourt.x;
  float halfW = uCourt.y;
  float hoopX = uCourt.z;
  float threeR = uCourt.w;
  float cornerZ = uCourt2.x;
  float keyW = uCourt2.y;
  float ftDist = uCourt2.z;
  float centreR = uCourt2.w;
  float aa = max(fwidth(p.x), fwidth(p.y)) * 0.9 + 0.0005;
  float w = 0.04;

  float dCourt = sdBox(p, vec2(halfL, halfW));
  vec2 q = vec2(abs(p.x), p.y);
  vec2 hoop = vec2(hoopX, 0.0);
  float dHoop = length(q - hoop);
  float arcX = hoopX - sqrt(max(threeR * threeR - cornerZ * cornerZ, 0.0));

  // --- surfaces
  float n1 = noise(p * 0.7);
  float n2 = noise(p * 3.1 + 7.0);
  vec3 outside = mix(uOutCol, uOutCol2, smoothstep(0.35, 0.65, n1));
  outside *= 0.94 + 0.12 * n2;
  // mowing stripes on grass themes
  outside *= 1.0 + uStripes * 0.05 * sign(sin(p.x * 1.1 + p.y * 0.35));
  vec3 apron = uApronCol * (0.96 + 0.08 * n2);
  bool inThree = (q.x > arcX) ? (abs(q.y) < cornerZ) : (dHoop < threeR);
  vec3 court = mix(uCourtCol, uCourtCol2, inThree ? 1.0 : 0.0);
  court *= 0.95 + 0.1 * n2;
  // the paint
  float keyL = ftDist + (halfL - hoopX);
  vec2 keyC = vec2(halfL - keyL * 0.5, 0.0);
  float dKey = sdBox(q - keyC, vec2(keyL * 0.5, keyW));
  court = mix(court, uKeyCol * (0.96 + 0.08 * n2), 1.0 - smoothstep(-aa, aa, dKey));
  // centre circle
  float dCentre = length(p) - centreR;
  court = mix(court, uCircleCol, (1.0 - smoothstep(-aa, aa, dCentre)) * 0.9);

  // --- lines
  float line = 0.0;
  line = max(line, stroke(dCourt, w, aa));
  line = max(line, stroke(p.x, w, aa) * step(abs(p.y), halfW));
  line = max(line, stroke(dCentre, w, aa));
  line = max(line, stroke(dKey, w, aa));
  float dFt = length(q - vec2(hoopX - ftDist, 0.0)) - 1.2;
  line = max(line, stroke(dFt, w, aa) * step(q.x, hoopX - ftDist + 0.02));
  float arc = stroke(dHoop - threeR, w, aa) * step(q.x, arcX + 0.02);
  float corner = stroke(abs(q.y) - cornerZ, w, aa) * step(arcX - 0.02, q.x) * step(q.x, halfL);
  line = max(line, max(arc, corner));
  // little arc under the rim
  line = max(line, stroke(dHoop - 1.15, w * 0.8, aa) * step(q.x, hoopX));
  line *= step(dCourt, w + aa);

  float inCourt = 1.0 - smoothstep(-aa, aa, dCourt);
  float inApron = 1.0 - smoothstep(-aa, aa, dCourt - 1.1);
  vec3 c = mix(outside, apron, inApron);
  c = mix(c, court, inCourt);
  c = mix(c, uLineCol, line * 0.95);

  // --- team rings under the players
  for (int i = 0; i < RINGS; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    float d = length(p - r.xy);
    float band = smoothstep(r.z - 0.11 - aa, r.z - 0.11 + aa, d) * (1.0 - smoothstep(r.z - aa, r.z + aa, d));
    float fill = (1.0 - smoothstep(r.z - 0.11 - aa, r.z - 0.11 + aa, d)) * 0.22;
    c = mix(c, uRingCol[i], clamp((band + fill) * r.w, 0.0, 1.0));
  }

  // --- soft shadows
  float sh = 0.0;
  for (int i = 0; i < SHADOWS; i++) {
    vec4 s = uShadows[i];
    if (s.w <= 0.0) continue;
    vec2 d = p - s.xy;
    // a wide, flat blob: the camera looks along the court
    d.y *= 1.35;
    float k = 1.0 - smoothstep(s.z * 0.62, s.z, length(d));
    sh = max(sh, k * s.w);
  }
  // shadows of players and the ball, on top of the ones baked under the scenery
  sh = 1.0 - (1.0 - sh) * vShade;
  c *= mix(vec3(1.0), vec3(0.44, 0.47, 0.62), sh);

  float fog = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld));
  fragColor = vec4(mix(c, uFogCol, fog), 1.0);
}
`;

/** Sky dome: a vertical gradient with a warm glow toward the sun. */
export const SKY_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
out vec3 vDir;
void main() {
  vDir = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
in vec3 vDir;
out vec4 fragColor;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.18);
  fragColor = vec4(c, 1.0);
}
`;

/** The net: a cone with strings drawn in the fragment shader, swishing when a shot drops. */
export const NET_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uSwish;   // seconds since the last make
uniform float uTime;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vec3 p = position;
  float low = uv.y;                         // 0 at the rim, 1 at the bottom
  float kick = exp(-uSwish * 3.2) * low;
  // the ball punches the net down and it rings back
  p.y -= kick * 0.22 * (0.6 + 0.4 * cos(uSwish * 22.0));
  float flare = kick * 0.5 * sin(uSwish * 17.0);
  p.xz *= 1.0 + flare * low;
  p.x += sin(uTime * 1.3 + p.y * 4.0) * 0.006 * low;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

export const NET_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // diamond lattice
  float a = vUv.x * 12.0;
  float b = vUv.y * 5.0;
  float d1 = abs(fract(a + b) - 0.5);
  float d2 = abs(fract(a - b) - 0.5);
  float d = min(d1, d2);
  float w = fwidth(d) * 1.2;
  float s = 1.0 - smoothstep(0.07, 0.07 + w, d);
  if (s < 0.02) discard;
  fragColor = vec4(uColor, s * (0.95 - 0.25 * vUv.y));
}
`;

/** Camera-facing soft quads: dust, sparks, confetti, the ball trail. */
export const PARTICLE_VERT = /* glsl */ `
precision highp float;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;   // particle centre (world)
in vec4 color;
in vec3 corner;     // xy = corner in -1..1, z = size
in vec2 spin;       // angle, shape (0 soft disc, 1 square, 2 sparkle)
out vec4 vColor;
out vec2 vCorner;
out float vShape;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float c = cos(spin.x);
  float s = sin(spin.x);
  vShape = spin.y;
  vec2 o = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * corner.z;
  mv.xy += o;
  vColor = color;
  vCorner = corner.xy;
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
in vec4 vColor;
in vec2 vCorner;
in float vShape;
out vec4 fragColor;
void main() {
  float r = length(vCorner);
  float a;
  if (vShape < 0.5) {
    a = 1.0 - smoothstep(0.45, 1.0, r);
  } else if (vShape < 1.5) {
    a = 1.0;
  } else {
    // four-point sparkle
    float arms = 1.0 - smoothstep(0.015, 0.07, abs(vCorner.x * vCorner.y));
    float core = 1.0 - smoothstep(0.1, 0.34, r);
    a = max(arms * (1.0 - smoothstep(0.55, 1.0, r)), core);
  }
  if (a * vColor.a < 0.01) discard;
  fragColor = vec4(vColor.rgb, vColor.a * a);
}
`;

/** Flat-shaded overlay quads in the world (shot meter, arrows). */
export const UNLIT_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export const METER_FRAG = /* glsl */ `
precision highp float;
uniform float uValue;    // 0..1.4, 1 = the perfect moment
uniform float uPerfect;  // half width of the perfect zone, in the same units
uniform float uGood;
uniform vec3 uInk;
uniform vec3 uFill;
uniform vec3 uPerfectCol;
uniform vec3 uGoodCol;
in vec2 vUv;
out vec4 fragColor;
float sdRound(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
void main() {
  // a tall capsule: v runs bottom to top
  vec2 p = (vUv - 0.5) * vec2(1.0, 4.0);
  float d = sdRound(p, vec2(0.5, 2.0), 0.5);
  float aa = fwidth(d);
  float body = 1.0 - smoothstep(-aa, aa, d);
  if (body < 0.01) discard;
  float inner = 1.0 - smoothstep(-aa, aa, d + 0.14);
  float v = vUv.y * 1.3;                 // the bar tops out a little past perfect
  vec3 c = uInk;
  vec3 track = mix(uInk, vec3(1.0), 0.14);
  float zoneGood = step(abs(v - 1.0), uGood);
  float zonePerfect = step(abs(v - 1.0), uPerfect);
  track = mix(track, uGoodCol * 0.55, zoneGood);
  track = mix(track, uPerfectCol * 0.8, zonePerfect);
  vec3 fill = uFill;
  fill = mix(fill, uGoodCol, zoneGood);
  fill = mix(fill, uPerfectCol, zonePerfect);
  float filled = step(v, uValue);
  c = mix(c, mix(track, fill, filled), inner);
  // marker line at the perfect moment
  c = mix(c, vec3(1.0), inner * (1.0 - smoothstep(0.012, 0.03, abs(v - 1.0))) * 0.9);
  fragColor = vec4(c, body);
}
`;

export const ARROW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uInk;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // a chunky downward triangle with an outline
  vec2 p = vUv - 0.5;
  p.y = -p.y;
  float d = max(abs(p.x) * 1.9 + p.y, -p.y - 0.42) - 0.4;
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a < 0.01) discard;
  float inner = 1.0 - smoothstep(-aa, aa, d + 0.09);
  fragColor = vec4(mix(uInk, uColor, inner), a);
}
`;

/** Full-screen wipe between plays: chunky diagonal bars that close and open. */
export const WIPE_VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const WIPE_FRAG = /* glsl */ `
precision highp float;
uniform float uCover;   // 0 = clear, 1 = fully covered
uniform float uDir;     // +1 closing from the left, -1 opening toward the right
uniform float uAspect;
uniform vec3 uColA;
uniform vec3 uColB;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // skewed coordinate so the edge is a slanted line
  float x = vUv.x + (vUv.y - 0.5) * 0.35 / uAspect * 1.6;
  float band = floor(vUv.y * 5.0);
  float lag = fract(band * 0.37) * 0.22;
  float edge = uCover * 1.6 - lag;
  float t = uDir > 0.0 ? x : 1.0 - x;
  float a = 1.0 - smoothstep(edge - 0.012, edge, t);
  if (a < 0.01) discard;
  vec3 c = mix(uColA, uColB, mod(band, 2.0));
  fragColor = vec4(c, a);
}
`;
