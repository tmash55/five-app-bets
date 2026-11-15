/**
 * The match's clock: display frames come whenever they come, the simulation moves in fixed 1/60 s steps.
 *
 * Each frame adds the real time it took (at most `MAX_FRAME`, so coming back from a long stall does not fast-forward
 * the game) to what is left over, and runs as many whole steps as fit, at most `MAX_STEPS`. So a frame drawn at
 * 30 a second runs two steps, one at 60 runs one, and a slow frame never changes what the game does: only how many
 * of the same steps run before the next picture. What is left over (less than a step) is how far between the last
 * two steps the picture is drawn.
 */

/** real seconds one frame may count for */
export const MAX_FRAME = 0.1;
/** steps one frame may run (0.1 s of play) */
export const MAX_STEPS = 6;

/**
 * Run the steps one frame has time for.
 * @param acc   seconds left over from the frames before
 * @param dt    real seconds since the last frame
 * @param scale how fast play runs now (slow motion below 1)
 * @param step  dt of one step
 * @param ready false while a step cannot run yet (online: the other device's moves for it have not come)
 * @param tick  runs one step
 * @returns the seconds left over, for the next frame and for drawing between steps
 */
export function runSteps(acc: number, dt: number, scale: number, step: number, ready: () => boolean, tick: () => void): number {
  acc += Math.min(MAX_FRAME, Math.max(0, dt)) * scale;
  let steps = 0;
  while (acc >= step && steps < MAX_STEPS && ready()) {
    tick();
    acc -= step;
    steps++;
  }
  // more than the cap (or waiting on the other device): the time is dropped rather than run in a burst later
  return acc >= step ? 0 : acc;
}
