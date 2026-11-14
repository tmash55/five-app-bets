import { DENSITY, drawScale } from '../GLSurface';

jest.mock('expo-gl', () => ({ GLView: () => null }));

describe('how many pixels a 3D view draws', () => {
  test('a phone with three pixels per point draws the match at two, and the home screen close-up at all three', () => {
    expect(drawScale(DENSITY.match, 3)).toBeCloseTo(2 / 3);
    expect(drawScale(DENSITY.stage, 3)).toBe(1);
  });

  test('a screen with fewer pixels than the limit is never drawn larger than it is', () => {
    expect(drawScale(DENSITY.match, 2)).toBe(1);
    expect(drawScale(DENSITY.match, 1)).toBe(1);
    expect(drawScale(DENSITY.stage, 2.625)).toBe(1);
    expect(drawScale(DENSITY.stage, 3.5)).toBeCloseTo(3 / 3.5);
  });
});
