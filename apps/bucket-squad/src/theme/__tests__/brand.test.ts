import { night } from '@/theme/arcade';
import brand from '@/theme/brand.json';

// The app's config is read before any of the game's code can run, so it keeps its own copy of two
// colours in brand.json. This keeps the copy honest.
describe('what the phone shows before the game is running', () => {
  it('is the arcade wall, so the loading picture and the first page are one room', () => {
    expect(brand.splash).toBe(night.wallTop);
    expect(brand.iconBackground).toBe(night.wallMid);
  });

  it('draws the loading picture small enough for the round window Android shows it through', () => {
    // the sign and all of its light stay inside a circle 0.9 of the picture's side across; the window is 192 points across
    expect(brand.splashWidth * 0.9).toBeLessThanOrEqual(192);
    expect(brand.splashWidth).toBeGreaterThanOrEqual(160);
  });
});
