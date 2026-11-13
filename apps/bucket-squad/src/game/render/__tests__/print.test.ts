/** The printed uniforms on the 3D players: where the print may go on a figure, what the shader is told, and that a plain one is drawn as before. */

import { HOLIDAY_UNIFORMS, PRINTED_UNIFORMS, SPECIAL_UNIFORMS } from '@/data/uniforms';
import { BONE_COUNT } from '../../kit/kit';
import { PRINT_STYLES, PRINT_UNDER_NUMBER, hexToRgb, type KitColors, type Look } from '../../kit/look';
import { buildFigureGeometry, printUniforms } from '../figure';
import { FIGURE_FRAG, FIGURE_VERT } from '../shaders';

/** a kit where every slot that matters has its own colour, so a vertex's colour says which slot it is */
const KIT: KitColors = { jersey: '#102030', trim: '#405060', number: '#708090', shorts: '#A0B0C0', shortsTrim: '#D0E0F0', shoe: '#112233', shoeAccent: '#445566', sole: '#778899', sock: '#AABBCC', band: '#DDEEFF' };

// three ships as an ES module jest cannot load here: the few pieces the figure code touches, as plain stand-ins
jest.mock('three', () => {
  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    toArray() {
      return [this.x, this.y, this.z];
    }
  }
  class BufferAttribute {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
    get count() {
      return this.array.length / this.itemSize;
    }
    getX(i: number) {
      return this.array[i * this.itemSize];
    }
    getY(i: number) {
      return this.array[i * this.itemSize + 1];
    }
    getZ(i: number) {
      return this.array[i * this.itemSize + 2];
    }
    getW(i: number) {
      return this.array[i * this.itemSize + 3];
    }
  }
  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {};
    boundingSphere: unknown = null;
    setAttribute(name: string, attr: BufferAttribute) {
      this.attributes[name] = attr;
    }
    getAttribute(name: string) {
      return this.attributes[name];
    }
    setIndex() {}
  }
  class Sphere {}
  return { Vector3, BufferAttribute, BufferGeometry, Sphere };
});

const look = (kit: KitColors): Look => ({ skin: '#C68642', hair: { style: 'buzz', color: '#1C1310' }, number: '23', kit });

const same = (rgb: readonly number[], hex: string) => hexToRgb(hex).every((c, i) => Math.abs(c - rgb[i]) < 1e-6);

describe('prints on the figures', () => {
  it('marks the jersey and the shorts for the print, and nothing else', () => {
    const { geometry } = buildFigureGeometry(look(KIT));
    const col = geometry.getAttribute('color');
    const counts = [0, 0, 0];
    for (let i = 0; i < col.count; i++) {
      const a = col.getW(i);
      const area = Math.floor(a / 4);
      const layer = a - 4 * area;
      const rgb = [col.getX(i), col.getY(i), col.getZ(i)];
      expect([0, 1, 2]).toContain(area);
      // the decal layer the depth nudge reads is what it always was
      expect([0, 1, 2]).toContain(layer);
      counts[area]++;
      if (area === 1) expect(same(rgb, KIT.jersey)).toBe(true);
      if (area === 2) expect(same(rgb, KIT.shorts)).toBe(true);
      // the number, the trim and the rest never take the print
      if (same(rgb, KIT.number) || same(rgb, KIT.trim) || same(rgb, KIT.shortsTrim)) expect(area).toBe(0);
      if (same(rgb, KIT.number)) expect(layer).toBe(1);
    }
    expect(counts[1]).toBeGreaterThan(100);
    expect(counts[2]).toBeGreaterThan(100);
  });

  it('tells the shader which print and its colours, and 0 for a plain uniform', () => {
    expect(printUniforms(look(KIT)).uPrint.value).toBe(0);
    for (const u of SPECIAL_UNIFORMS) expect(printUniforms(look(u.kit)).uPrint.value).toBe(0);
    for (const u of [...PRINTED_UNIFORMS, ...HOLIDAY_UNIFORMS]) {
      const p = u.kit.print;
      if (!p) throw new Error(`${u.id} has no print`);
      const un = printUniforms(look(u.kit));
      expect(un.uPrint.value).toBe(PRINT_STYLES.indexOf(p.style) + 1);
      expect(un.uPrintShorts.value).toBe(p.shorts === false ? 0 : 1);
      expect(un.uPrintA.value.toArray()).toEqual(hexToRgb(p.colors[0]));
      expect(un.uPrintB.value.toArray()).toEqual(hexToRgb(p.colors[1]));
      expect(un.uPrintC.value.toArray()).toEqual(hexToRgb(p.colors[2] ?? p.colors[0]));
    }
  });

  it('works the print out in the rest pose, skips it on one test for a plain uniform, and calms it behind the number', () => {
    // a print follows the body: each vertex's own position plus its bone's joint, one joint per bone
    expect(FIGURE_VERT).toContain(`const vec3 PIVOT[${BONE_COUNT}] = vec3[${BONE_COUNT}](`);
    expect(FIGURE_VERT.match(/vec3\(-?\d/g)?.length).toBe(BONE_COUNT);
    expect(FIGURE_VERT).toContain('vPrint = vec4(position + PIVOT[bi], area);');
    expect(FIGURE_FRAG).toContain('vec3 base = uPrint > 0.5 ? printed(vColor, vPrint) : vColor;');
    // the print keeps PRINT_UNDER_NUMBER of itself behind the number
    expect(FIGURE_FRAG).toContain(`calm * ${(1 - PRINT_UNDER_NUMBER).toFixed(4)}`);
    // no textures and no loops in the print
    expect(FIGURE_FRAG).not.toMatch(/sampler|texture\(|for\s*\(/);
  });
});
