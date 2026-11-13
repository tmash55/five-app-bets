/**
 * GLSL for the match scene. Everything is drawn with small hand-written
 * shaders and vertex colours: no textures, no lights from the engine. That
 * keeps the look consistent (soft, matte, sunny) and keeps it cheap on phones.
 */

import { BONE_COUNT, KIT_BONES } from '../kit/kit';
import { PRINT_UNDER_NUMBER } from '../kit/look';

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

/** Each bone's joint in the rest pose: a vertex's own position plus its bone's joint is where it sits on the body. */
const PIVOTS = KIT_BONES.map((b) => `vec3(${b.pivot.map((v) => v.toFixed(4)).join(', ')})`).join(', ');

const f = (n: number) => n.toFixed(4);

export const FIGURE_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 uBones[${BONE_COUNT}];
uniform float uDecalBias;
const vec3 PIVOT[${BONE_COUNT}] = vec3[${BONE_COUNT}](${PIVOTS});
in vec3 position;
in vec3 normal;
in vec4 color;      // rgb + decal layer (0 = solid surface) + 4 x print area (0 none, 1 jersey, 2 shorts)
in float bone;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
out vec4 vPrint;    // where on the body in the rest pose (so a print moves with the cloth), and the print area
void main() {
  int bi = int(bone + 0.5);
  mat4 b = uBones[bi];
  vec4 world = modelMatrix * (b * vec4(position, 1.0));
  vNormal = mat3(modelMatrix) * (mat3(b) * normal);
  vColor = color.rgb;
  vWorld = world.xyz;
  float area = floor(color.a * 0.25 + 0.01);
  vPrint = vec4(position + PIVOT[bi], area);
  gl_Position = projectionMatrix * viewMatrix * world;
  // painted details (eyes, mouth, numbers) win the depth test against the skin under them
  gl_Position.z -= (color.a - 4.0 * area) * uDecalBias * gl_Position.w;
}
`;

/**
 * The printed patterns (look.ts PRINT_STYLES, numbered from 1). Each is a few lines of maths on the rest-pose
 * position, so a print costs no texture and no extra draw, and a plain uniform skips it all on one uniform test.
 * Sizes are in figure units: the jersey is about 0.43 wide and 0.38 tall, its centre at y 0.68.
 */
const PRINTS = /* glsl */ `
uniform float uPrint;        // 0 plain, else 1 + the style's place in PRINT_STYLES
uniform float uPrintShorts;  // 1 when the shorts are printed too
uniform vec3 uPrintA;
uniform vec3 uPrintB;
uniform vec3 uPrintC;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// 1 inside [a, b] with soft edges of half-width w
float bandOf(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
}
// 1 on a band of width 0.25 round centre c of a value that wraps at 1, soft edges e
float ringBand(float s, float c, float e) {
  float d = abs(fract(s - c + 0.5) - 0.5);
  return 1.0 - smoothstep(0.125 - e, 0.125 + e, d);
}
// a line of half-width w at distance d, smoothed over aa
float lineOf(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, d);
}

vec3 printOn(vec3 base, vec3 p) {
  vec3 c = base;
  if (uPrint < 1.5) {
    // tie-dye: three arms spiralling out from the chest, edges soft as dye bled into cloth, a little crinkle
    vec2 q = vec2(p.x, p.y - 0.68);
    float r = length(vec3(q, p.z * 0.4));
    float ang = atan(q.x, q.y);
    // three arms a lap (0.477 = 3 / 2 pi), so the spiral closes on itself below the centre
    float s = r * 6.5 + ang * 0.477465 + 0.05 * sin(ang * 5.0 + r * 30.0) + 0.03 * sin(p.x * 41.0) * sin(p.y * 37.0 + p.z * 23.0);
    c = mix(c, uPrintA, ringBand(s, 0.125, 0.06));
    c = mix(c, uPrintB, ringBand(s, 0.375, 0.06));
    c = mix(c, uPrintC, ringBand(s, 0.625, 0.06));
  } else if (uPrint < 2.5) {
    // galaxy: swirling clouds in two colours with a brighter core, and stars scattered through space
    float n = sin(p.x * 13.0 + sin(p.y * 11.0 + p.z * 9.0) * 1.7) * sin(p.y * 9.0 - p.z * 7.0 + sin(p.x * 10.0 + p.z * 6.0) * 1.6);
    c = mix(c, uPrintA, smoothstep(0.1, 0.85, n) * 0.8);
    c = mix(c, uPrintB, smoothstep(0.1, 0.85, -n) * 0.7);
    c = mix(c, uPrintC, smoothstep(0.8, 1.0, abs(n)) * 0.45);
    vec3 g = p * 30.0;
    float h = hash13(floor(g));
    vec3 at = vec3(fract(h * 17.0), fract(h * 31.0), fract(h * 57.0)) * 0.5 + 0.25;
    float d = length(fract(g) - at);
    float rad = 0.14 + 0.14 * fract(h * 91.0);
    float aa = max(fwidth(d), 0.02);
    c = mix(c, vec3(1.0), lineOf(d, rad, aa) * step(0.6, h));
  } else if (uPrint < 3.5) {
    // lightning: jagged bolts slanting across the body, a bright core in a glow
    float zig = abs(fract(dot(p, vec3(1.0, -0.3, 0.9)) * 6.0) - 0.5) * 2.0;
    float u = dot(p, vec3(0.45, 1.0, 0.25)) * 4.2 + 0.3 * zig;
    float k = hash12(vec2(floor(u), 7.0));
    float d = abs(fract(u) - 0.5);
    float aa = fwidth(u);
    float w = 0.035 + 0.025 * k;
    c = mix(c, uPrintB, lineOf(d, w * 2.2, aa) * 0.9);
    c = mix(c, uPrintA, lineOf(d, w, aa));
  } else if (uPrint < 4.5) {
    // candy stripes on a slant: a wide one, a narrow one and a pinstripe
    float u = dot(p, vec3(0.7, 1.0, 0.45)) * 8.0;
    float s = fract(u);
    float aa = fwidth(u);
    c = mix(c, uPrintA, bandOf(s, 0.06, 0.38, aa));
    c = mix(c, uPrintB, bandOf(s, 0.52, 0.7, aa));
    c = mix(c, uPrintC, bandOf(s, 0.8, 0.86, aa));
  } else if (uPrint < 5.5) {
    // spider web: spokes from a high corner and sagging threads between them, a glow at its heart
    vec2 q = p.xy - vec2(0.2, 0.9);
    float r = length(q);
    float t = atan(q.y, q.x) * 2.228169;   // 14 spokes a lap
    float sa = abs(fract(t + 0.5) - 0.5) * 0.448799 * r;
    float sag = r / (1.0 - 0.12 * sin(3.14159 * fract(t)));
    float rr = abs(fract(sag * 13.0 + 0.5) - 0.5) / 13.0;
    float aa = fwidth(r) + 0.0002;
    c = mix(c, uPrintB, (1.0 - smoothstep(0.0, 0.3, r)) * 0.4);
    c = mix(c, uPrintA, lineOf(min(sa, rr), 0.006, aa));
  } else {
    // snowflakes: six-armed flakes in a scattered grid wrapped round the body, a few left out
    float ang = atan(p.x, p.z);
    vec2 g = vec2(ang * 1.909859, p.y * 9.0);   // 12 cells round the body (12 / 2 pi)
    vec2 cell = floor(g);
    cell.x = mod(cell.x, 12.0);
    float h = hash12(cell);
    vec2 l = fract(g) - 0.5 - (vec2(fract(h * 13.0), fract(h * 29.0)) - 0.5) * 0.3;
    float rl = length(l);
    float d = min(abs(l.y), min(abs(dot(l, vec2(0.866, -0.5))), abs(dot(l, vec2(0.866, 0.5)))));
    float rad = 0.2 + 0.1 * fract(h * 7.0);
    float aa = max(fwidth(l.y), 0.01);
    float flake = lineOf(d, 0.035, aa) * lineOf(rl, rad, aa);
    flake = max(flake, lineOf(rl, 0.075, aa));
    // a little dot of the second colour between flakes
    vec2 corner = floor(g + 0.5);
    corner.x = mod(corner.x, 12.0);
    float dotB = lineOf(length(fract(g + 0.5) - 0.5), 0.05, aa) * step(0.5, hash12(corner + 17.0));
    c = mix(c, uPrintB, dotB);
    c = mix(c, uPrintA, flake * step(0.25, h));
  }
  return c;
}

// the print in this fragment's colour, calmed behind the numbers so they stay easy to read
vec3 printed(vec3 base, vec4 at) {
  float on = step(0.5, at.w) * max(step(at.w, 1.5), uPrintShorts);
  vec3 c = printOn(base, at.xyz);
  vec2 nb = abs(vec2(at.x, at.y - 0.69)) - vec2(0.12, 0.085);
  float calm = (1.0 - smoothstep(0.0, 0.03, length(max(nb, 0.0)))) * smoothstep(0.05, 0.1, abs(at.z)) * step(at.w, 1.5);
  c = mix(c, base, calm * ${f(1 - PRINT_UNDER_NUMBER)});
  return mix(base, c, on);
}
`;

export const FIGURE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cameraPosition;
uniform float uFlash;
uniform vec3 uGlow;
uniform float uBaseY;
${LIGHTING}
${PRINTS}
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
in vec4 vPrint;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  // a plain uniform skips the print on this one test (the same for the whole figure)
  vec3 base = uPrint > 0.5 ? printed(vColor, vPrint) : vColor;
  vec3 c = shadeMatte(base, n, v);
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
in vec2 spin;       // angle, shape (0 soft disc, 1 square, 2 sparkle, 3 flame)
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
  vec3 col = vColor.rgb;
  if (vShape < 0.5) {
    a = 1.0 - smoothstep(0.45, 1.0, r);
  } else if (vShape < 1.5) {
    a = 1.0;
  } else if (vShape < 2.5) {
    // four-point sparkle
    float arms = 1.0 - smoothstep(0.015, 0.07, abs(vCorner.x * vCorner.y));
    float core = 1.0 - smoothstep(0.1, 0.34, r);
    a = max(arms * (1.0 - smoothstep(0.55, 1.0, r)), core);
  } else {
    // flame tongue: a round base low in the quad, narrowing to a point at the top
    vec2 q = vCorner;
    const float base = -0.48;
    const float rad = 0.5;
    float d;
    if (q.y < base) {
      d = length(vec2(q.x, q.y - base)) / rad;
    } else {
      float u = clamp((q.y - base) / (1.0 - base), 0.0, 1.0);
      float hw = rad * pow(1.0 - u, 1.15) + 0.001;
      d = abs(q.x) / hw;
    }
    a = 1.0 - smoothstep(0.82, 1.0, d);
    // a pale heart low in the tongue
    float heart = (1.0 - smoothstep(0.25, 0.6, d)) * (1.0 - smoothstep(-0.3, 0.4, q.y));
    col = mix(col, vec3(1.0), 0.5 * heart);
  }
  if (a * vColor.a < 0.01) discard;
  fragColor = vec4(col, vColor.a * a);
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

/**
 * The warm-up stage's round base: lit like everything else, with a piece of
 * court painted on top (drawn analytically so the lines stay crisp) and soft
 * contact shadows under the figures and balls.
 */
export const BASE_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 normal;
in vec3 color;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
out vec3 vLocal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = mat3(modelMatrix) * normal;
  vColor = color;
  vWorld = world.xyz;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const BASE_FRAG = /* glsl */ `
precision highp float;
#define STAGE_SHADOWS 16
uniform vec3 cameraPosition;
uniform float uRadius;
uniform vec3 uCourtCol;
uniform vec3 uBandCol;
uniform vec3 uCircleCol;
uniform vec3 uLineCol;
uniform vec4 uShadows[STAGE_SHADOWS];  // world x, z, radius, strength
${LIGHTING}
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
in vec3 vLocal;
out vec4 fragColor;
float ring(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 base = vColor;
  float top = step(0.9, n.y) * step(-0.002, vLocal.y);
  if (top > 0.5) {
    vec2 p = vLocal.xz;
    float r = length(p);
    float aa = fwidth(r) * 1.1 + 0.0008;
    float R = uRadius;
    vec3 c = uCourtCol;
    // faint boards across the court
    float board = fract(p.x * 4.2 / R * 2.0);
    c *= 0.975 + 0.035 * smoothstep(0.0, 0.08, board) * (1.0 - smoothstep(0.92, 1.0, board));
    float lw = R * 0.016;
    // centre circle in the team colour
    c = mix(c, uCircleCol, 1.0 - smoothstep(R * 0.34 - aa, R * 0.34 + aa, r));
    // the apron band round the edge
    c = mix(c, uBandCol, smoothstep(R * 0.8 - aa, R * 0.8 + aa, r));
    float line = ring(r - R * 0.34, lw, aa);
    line = max(line, ring(r - R * 0.8, lw, aa));
    float aax = fwidth(p.y) * 1.1 + 0.0008;
    line = max(line, (1.0 - smoothstep(lw - aax, lw + aax, abs(p.y))) * (1.0 - smoothstep(R * 0.8 - aa, R * 0.8 + aa, r)));
    base = mix(c, uLineCol, line * 0.95);
  }
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 col = shadeMatte(base, n, v);
  // soft contact shadows on the top
  float sh = 0.0;
  for (int i = 0; i < STAGE_SHADOWS; i++) {
    vec4 s = uShadows[i];
    if (s.w <= 0.0) continue;
    float d = length(vWorld.xz - s.xy);
    sh = max(sh, (1.0 - smoothstep(s.z * 0.25, s.z, d)) * s.w);
  }
  sh *= step(-0.01, vWorld.y);
  col *= mix(vec3(1.0), vec3(0.5, 0.52, 0.66), sh);
  fragColor = vec4(col, 1.0);
}
`;

/** A soft shadow on the backdrop under the base: premultiplied, so it darkens whatever is behind the GL view. */
export const DROP_FRAG = /* glsl */ `
precision highp float;
uniform float uStrength;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, r)) * uStrength;
  if (a < 0.002) discard;
  fragColor = vec4(0.0, 0.02, 0.08, 1.0) * a;
}
`;
