/**
 * Small allocation-free maths for posing figures: rigid frames, limb IK and
 * writing 4x4 matrices straight into the bone palette.
 *
 * Conventions (figure space): Y is up, the figure faces +Z, its left side is +X.
 *   yaw   (about Y): positive turns toward the figure's left
 *   pitch (about X): positive leans forward
 *   roll  (about Z): positive leans to the figure's right
 */

/** Basis columns then origin: [xx,xy,xz, yx,yy,yz, zx,zy,zz, px,py,pz]. */
export type Frame = Float64Array;

export function newFrame(): Frame {
  const f = new Float64Array(12);
  f[0] = 1;
  f[4] = 1;
  f[8] = 1;
  return f;
}

/** Rotation R = Ry(yaw) * Rx(pitch) * Rz(roll); the origin is left alone. */
export function frameEuler(f: Frame, yaw: number, pitch: number, roll: number): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  f[0] = cy * cz + sy * sx * sz;
  f[1] = cx * sz;
  f[2] = -sy * cz + cy * sx * sz;
  f[3] = -cy * sz + sy * sx * cz;
  f[4] = cx * cz;
  f[5] = sy * sz + cy * sx * cz;
  f[6] = sy * cx;
  f[7] = -sx;
  f[8] = cy * cx;
}

export function framePos(f: Frame, x: number, y: number, z: number): void {
  f[9] = x;
  f[10] = y;
  f[11] = z;
}

/** out = a * b (apply b first, then a). `out` must not be `a` or `b`. */
export function frameMul(out: Frame, a: Frame, b: Frame): void {
  for (let c = 0; c < 3; c++) {
    const bx = b[c * 3];
    const by = b[c * 3 + 1];
    const bz = b[c * 3 + 2];
    out[c * 3] = a[0] * bx + a[3] * by + a[6] * bz;
    out[c * 3 + 1] = a[1] * bx + a[4] * by + a[7] * bz;
    out[c * 3 + 2] = a[2] * bx + a[5] * by + a[8] * bz;
  }
  const px = b[9];
  const py = b[10];
  const pz = b[11];
  out[9] = a[0] * px + a[3] * py + a[6] * pz + a[9];
  out[10] = a[1] * px + a[4] * py + a[7] * pz + a[10];
  out[11] = a[2] * px + a[5] * py + a[8] * pz + a[11];
}

/** Transform a point by a frame. */
export function frameApply(f: Frame, x: number, y: number, z: number, out: Float64Array, o = 0): void {
  out[o] = f[0] * x + f[3] * y + f[6] * z + f[9];
  out[o + 1] = f[1] * x + f[4] * y + f[7] * z + f[10];
  out[o + 2] = f[2] * x + f[5] * y + f[8] * z + f[11];
}

/** Write a frame (with a scale along its own axes) as a column-major 4x4. */
export function frameToM4(f: Frame, out: Float32Array, o: number, sx = 1, sy = 1, sz = 1): void {
  out[o] = f[0] * sx;
  out[o + 1] = f[1] * sx;
  out[o + 2] = f[2] * sx;
  out[o + 3] = 0;
  out[o + 4] = f[3] * sy;
  out[o + 5] = f[4] * sy;
  out[o + 6] = f[5] * sy;
  out[o + 7] = 0;
  out[o + 8] = f[6] * sz;
  out[o + 9] = f[7] * sz;
  out[o + 10] = f[8] * sz;
  out[o + 11] = 0;
  out[o + 12] = f[9];
  out[o + 13] = f[10];
  out[o + 14] = f[11];
  out[o + 15] = 1;
}

export interface LimbResult {
  /** middle joint (elbow / knee) */
  mx: number;
  my: number;
  mz: number;
  /** where the end actually landed */
  ex: number;
  ey: number;
  ez: number;
  /** hinge axis (unit), perpendicular to the plane of the limb */
  nx: number;
  ny: number;
  nz: number;
  /** how much the segments were lengthened to reach (1 = none) */
  stretch: number;
}

export function newLimbResult(): LimbResult {
  return { mx: 0, my: 0, mz: 0, ex: 0, ey: 0, ez: 0, nx: 1, ny: 0, nz: 0, stretch: 1 };
}

/**
 * Two-bone IK from (ox,oy,oz) to (tx,ty,tz).
 * The middle joint leans toward the pole direction. `front` says which way the
 * hinge opens: +1 for arms (the elbow points away from the limb's front), -1
 * for legs (the knee points toward it).
 * Segments stretch (cartoon style) up to `maxStretch` when the target is out of reach.
 */
export function solveLimb(
  ox: number,
  oy: number,
  oz: number,
  tx: number,
  ty: number,
  tz: number,
  l1: number,
  l2: number,
  px: number,
  py: number,
  pz: number,
  front: 1 | -1,
  maxStretch: number,
  out: LimbResult,
): void {
  let dx = tx - ox;
  let dy = ty - oy;
  let dz = tz - oz;
  let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-5) {
    dx = 0;
    dy = -1;
    dz = 0;
    dist = 1e-5;
  } else {
    dx /= dist;
    dy /= dist;
    dz /= dist;
  }
  const reach = (l1 + l2) * 0.985;
  let s = 1;
  if (dist > reach) s = Math.min(maxStretch, dist / reach);
  const a1 = l1 * s;
  const a2 = l2 * s;
  const lo = Math.abs(a1 - a2) + 1e-4;
  const hi = a1 + a2 - 1e-4;
  const dd = dist < lo ? lo : dist > hi ? hi : dist;
  // pole, made perpendicular to the reach direction
  let k = px * dx + py * dy + pz * dz;
  let qx = px - dx * k;
  let qy = py - dy * k;
  let qz = pz - dz * k;
  let ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (ql < 1e-4) {
    // pole lines up with the limb: fall back to "behind", then "sideways"
    const fx = Math.abs(dz) < 0.9 ? 0 : 1;
    const fz = Math.abs(dz) < 0.9 ? -1 : 0;
    k = fx * dx + fz * dz;
    qx = fx - dx * k;
    qy = -dy * k;
    qz = fz - dz * k;
    ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
  }
  qx /= ql;
  qy /= ql;
  qz /= ql;
  const along = (a1 * a1 - a2 * a2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, a1 * a1 - along * along));
  out.mx = ox + dx * along + qx * h;
  out.my = oy + dy * along + qy * h;
  out.mz = oz + dz * along + qz * h;
  out.ex = ox + dx * dd;
  out.ey = oy + dy * dd;
  out.ez = oz + dz * dd;
  // hinge axis = front * (dir x perp)
  out.nx = front * (dy * qz - dz * qy);
  out.ny = front * (dz * qx - dx * qz);
  out.nz = front * (dx * qy - dy * qx);
  out.stretch = s;
}

/**
 * Frame for a limb segment whose rest shape hangs along -Y from its pivot:
 * origin at (ax,ay,az), pointing at (bx,by,bz), with the hinge axis as local X.
 */
export function segmentFrame(
  f: Frame,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  nx: number,
  ny: number,
  nz: number,
): void {
  let yx = ax - bx;
  let yy = ay - by;
  let yz = az - bz;
  const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1;
  yx /= yl;
  yy /= yl;
  yz /= yl;
  // re-square the hinge axis against the segment
  const k = nx * yx + ny * yy + nz * yz;
  let xx = nx - yx * k;
  let xy = ny - yy * k;
  let xz = nz - yz * k;
  const xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  f[0] = xx;
  f[1] = xy;
  f[2] = xz;
  f[3] = yx;
  f[4] = yy;
  f[5] = yz;
  f[6] = xy * yz - xz * yy;
  f[7] = xz * yx - xx * yz;
  f[8] = xx * yy - xy * yx;
  f[9] = ax;
  f[10] = ay;
  f[11] = az;
}

/** Rotate a frame's basis about its own X axis (positive tips +Y toward +Z). */
export function framePitchLocal(f: Frame, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const yx = f[3];
  const yy = f[4];
  const yz = f[5];
  const zx = f[6];
  const zy = f[7];
  const zz = f[8];
  f[3] = yx * c + zx * s;
  f[4] = yy * c + zy * s;
  f[5] = yz * c + zz * s;
  f[6] = zx * c - yx * s;
  f[7] = zy * c - yy * s;
  f[8] = zz * c - yz * s;
}
