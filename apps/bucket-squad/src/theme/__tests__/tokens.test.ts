import { design, scaleFor, uiScale, usableScreen } from '@/theme/tokens';

describe('the screen scale', () => {
  it('is 1 on the screen the game is designed for, either way up', () => {
    expect(scaleFor(design.width, design.height)).toBe(1);
    expect(scaleFor(design.height, design.width)).toBe(1);
    expect(uiScale).toBe(1);
  });

  it('follows the tighter side and stays inside its limits', () => {
    expect(scaleFor(640, 360)).toBe(0.8);
    expect(scaleFor(568, 320)).toBe(0.8);
    expect(scaleFor(932, 430)).toBeCloseTo(430 / 390, 5);
    expect(scaleFor(1366, 1024)).toBeCloseTo(1366 / 844, 5);
    expect(scaleFor(2732, 2048)).toBe(1.7);
    expect(scaleFor(0, 0)).toBe(1);
  });
});

describe('the room a screen really has', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };

  it('is the whole screen when nothing is in the way', () => {
    expect(usableScreen(844, 390, null)).toEqual({ long: 844, short: 390 });
    expect(usableScreen(390, 844, undefined)).toEqual({ long: 844, short: 390 });
    expect(usableScreen(844, 390, { frame: { width: 844, height: 390 }, insets: none })).toEqual({ long: 844, short: 390 });
  });

  it('does not count what fits inside the gap a screen keeps at its edges anyway', () => {
    expect(usableScreen(844, 390, { frame: { width: 844, height: 390 }, insets: { top: 6, right: 14, bottom: 8, left: 16 } })).toEqual({ long: 844, short: 390 });
  });

  it('takes off what a camera island and a home bar cost a phone held sideways', () => {
    const phone = usableScreen(874, 402, { frame: { width: 874, height: 402 }, insets: { top: 0, right: 62, bottom: 21, left: 62 } });
    const k = scaleFor(phone.long, phone.short);
    // the layout gets exactly the room between the island and the far edge, plus its own gaps
    expect(phone.long).toBeCloseTo(874 - 2 * (62 - 16 * k), 3);
    expect(phone.short).toBeCloseTo(402 - (21 - 8 * k), 3);
    expect(k).toBeGreaterThan(0.9);
    expect(k).toBeLessThan(scaleFor(874, 402));
    // and what is left between the insets is what the design keeps between its gaps, at that scale
    expect(874 - 62 - 62).toBeCloseTo((design.width - 2 * 16) * k, 3);
  });

  it('reads the insets the way up they were measured', () => {
    const sideways = usableScreen(874, 402, { frame: { width: 874, height: 402 }, insets: { top: 0, right: 62, bottom: 0, left: 62 } });
    const upright = usableScreen(874, 402, { frame: { width: 402, height: 874 }, insets: { top: 62, right: 0, bottom: 62, left: 0 } });
    expect(upright).toEqual(sideways);
  });

  it('never ends with no room at all', () => {
    const odd = usableScreen(300, 200, { frame: { width: 300, height: 200 }, insets: { top: 500, right: 500, bottom: 500, left: 500 } });
    expect(odd.long).toBeGreaterThan(0);
    expect(odd.short).toBeGreaterThan(0);
    expect(usableScreen(844, 390, { frame: { width: 844, height: 390 }, insets: { top: -5, right: Number.NaN, bottom: 0, left: 0 } })).toEqual({ long: 844, short: 390 });
  });
});
