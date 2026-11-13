import { MIN_FIT, fitName } from '../fitName';

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
});
