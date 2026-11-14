import { MIN_FIT, fitName, fitSize, textWidth } from '../fitName';

describe('fitName', () => {
  it('leaves a name that fits alone', () => {
    expect(fitName('Nia Brooks', 16, 200)).toEqual({ text: 'Nia Brooks', px: 16 });
  });

  it('shrinks a name that nearly fits, but never below the floor', () => {
    const fit = fitName('Wren Kowalski', 16, 100);
    expect(fit.text).toBe('Wren Kowalski');
    expect(fit.px).toBeLessThan(16);
    expect(fit.px).toBeGreaterThanOrEqual(16 * MIN_FIT);
  });

  it('uses the first name and an initial when shrinking is not enough', () => {
    expect(fitName('Wren Kowalski', 16, 70).text).toBe('Wren K.');
  });

  it('takes the initial from the family name, not from an ending like Jr.', () => {
    expect(fitName('Hank Dooley Jr.', 16, 70).text).toBe('Hank D.');
    expect(fitName('Otis Washington III', 16, 70).text).toBe('Otis W.');
  });

  it('falls back to the short name when even the initial form is too long', () => {
    expect(fitName('Maximilian-Alexander Featherstonehaugh', 16, 70, 'Max').text).toBe('Max');
    expect(fitName('Maximilian-Alexander Featherstonehaugh', 16, 70).text).toBe('Maximilian-Alexander F.');
  });

  it('keeps a one-word name whole', () => {
    expect(fitName('Moose', 16, 20).text).toBe('Moose');
  });

  it('measures each letter, so a long name of narrow letters is not cut short', () => {
    // the same number of letters, but wide ones need more room than narrow ones
    expect(textWidth('Mwww', 16)).toBeGreaterThan(textWidth('Iill', 16) * 2);
    // a long name that fits once shrunk a little keeps every letter
    const long = 'Bartholomew Hollingsworth-Lee';
    const room = textWidth(long, 20) * 0.8;
    const fit = fitName(long, 20, room, 'Bart');
    expect(fit.text).toBe(long);
    expect(textWidth(fit.text, fit.px)).toBeLessThanOrEqual(room);
  });

  it('never measures a fitted name wider than its room', () => {
    for (const name of ['Wren Kowalski', 'Hank Dooley Jr.', 'Zoë Ångström-Wu', 'Maximilian-Alexander Featherstonehaugh']) {
      for (const room of [60, 90, 120, 180]) {
        const fit = fitName(name, 16, room, 'Max');
        if (fit.px > 16 * MIN_FIT) expect(textWidth(fit.text, fit.px)).toBeLessThanOrEqual(room);
      }
    }
  });
});

describe('fitSize', () => {
  it('keeps the size of a line that fits, and shrinks one that does not, down to the floor', () => {
    expect(fitSize('Comets', 20, 200)).toBe(20);
    const px = fitSize('Timberwolves', 20, textWidth('Timberwolves', 20) * 0.9);
    expect(px).toBeLessThan(20);
    expect(px).toBeGreaterThanOrEqual(20 * MIN_FIT);
    expect(fitSize('Timberwolves', 20, 10)).toBe(20 * MIN_FIT);
  });
});
