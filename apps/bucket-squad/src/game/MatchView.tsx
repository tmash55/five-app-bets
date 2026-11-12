import { GLView } from 'expo-gl';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import type { GLContextLike, MatchRunner } from './runner';

/** The 3D view of a match. The runner owns the game; this only gives it a surface to draw on. */
export function MatchView({ runner }: { runner: MatchRunner }) {
  useEffect(() => () => runner.detach(), [runner]);
  return (
    <GLView
      style={StyleSheet.absoluteFill}
      msaaSamples={4}
      onContextCreate={(gl) => runner.attach(gl as unknown as GLContextLike)}
    />
  );
}
