import { useEffect } from 'react';

import { DENSITY, GLSurface } from './GLSurface';
import type { GLContextLike, MatchRunner } from './runner';

/** The 3D view of a match. The runner owns the game; this only gives it a surface to draw on. */
export function MatchView({ runner }: { runner: MatchRunner }) {
  useEffect(() => () => runner.detach(), [runner]);
  return <GLSurface density={DENSITY.match} quality={runner.quality} onContextCreate={(gl) => runner.attach(gl as GLContextLike)} />;
}
