import { bulbSpots } from '../marquee';

describe('the legend marquee', () => {
  it('keeps every bulb inside the safe area of a phone held sideways', () => {
    const safe = { top: 0, right: 62, bottom: 21, left: 62 };
    const spots = bulbSpots(874, 402, safe);
    expect(spots.length).toBeGreaterThan(40);
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(safe.left);
      expect(s.x).toBeLessThanOrEqual(874 - safe.right);
      expect(s.y).toBeGreaterThanOrEqual(safe.top);
      expect(s.y).toBeLessThanOrEqual(402 - safe.bottom);
    }
  });

  it('runs close round the edge where nothing is in the way', () => {
    const spots = bulbSpots(844, 390);
    expect(Math.min(...spots.map((s) => s.x))).toBeLessThan(20);
    expect(Math.max(...spots.map((s) => s.y))).toBeGreaterThan(370);
  });
});
