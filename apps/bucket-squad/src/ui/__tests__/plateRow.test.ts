import { placePlates } from '../arcade/plateRow';

describe('placePlates', () => {
  it('keeps plates under their figures when there is room', () => {
    const out = placePlates(
      [
        { at: 100, width: 80 },
        { at: 250, width: 90 },
        { at: 400, width: 80 },
      ],
      0,
      500,
      8,
    );
    expect(out.map((p) => p.x)).toEqual([100, 250, 400]);
    expect(out.map((p) => p.width)).toEqual([80, 90, 80]);
  });

  it('leans the outer plates outward before narrowing any', () => {
    const out = placePlates(
      [
        { at: 140, width: 130 },
        { at: 260, width: 130 },
        { at: 380, width: 130 },
      ],
      0,
      520,
      6,
    );
    expect(out.map((p) => p.width)).toEqual([130, 130, 130]);
    expect(out[1].x).toBeCloseTo(260, 3);
    expect(out[0].x).toBeLessThan(140);
    expect(out[2].x).toBeGreaterThan(380);
    for (let i = 1; i < out.length; i++) expect(out[i].x - out[i].width / 2 - (out[i - 1].x + out[i - 1].width / 2)).toBeGreaterThanOrEqual(6 - 1e-9);
    // each figure still stands over its own plate
    out.forEach((p, i) => expect(Math.abs(p.x - [140, 260, 380][i])).toBeLessThanOrEqual(p.width * 0.3 + 1e-9));
  });

  it('narrows the widest plates when leaning is not enough, and stays inside the edges', () => {
    const out = placePlates(
      [
        { at: 60, width: 200 },
        { at: 160, width: 90 },
        { at: 260, width: 200 },
      ],
      0,
      320,
      6,
    );
    expect(Math.max(...out.map((p) => p.width))).toBeLessThan(200);
    expect(out[0].x - out[0].width / 2).toBeGreaterThanOrEqual(-1e-9);
    expect(out[2].x + out[2].width / 2).toBeLessThanOrEqual(320 + 1e-9);
    for (let i = 1; i < out.length; i++) expect(out[i].x - out[i].width / 2).toBeGreaterThanOrEqual(out[i - 1].x + out[i - 1].width / 2 + 6 - 1e-9);
  });
});
