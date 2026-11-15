import { GLView } from 'expo-gl';
import { useState, useSyncExternalStore } from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { LEVELS, type Governor } from './quality';

/**
 * The most pixels per point each 3D view draws. A phone screen has three: the
 * match draws two and is stretched to fit, which is less than half the pixels,
 * and its figures are small and moving, so the loss is hard to see. The
 * warm-up on the home screen is a close-up, so it keeps every pixel.
 */
export const DENSITY = { match: 2, stage: 3 } as const;

/**
 * For development on something slow (the iOS Simulator draws 3D without a
 * graphics chip): start the bundler with EXPO_PUBLIC_BS_RENDER_DENSITY=0.5 and
 * every 3D view draws that many pixels per point instead. Below 1 the edge
 * smoothing goes too.
 */
const asked = Number(process.env.EXPO_PUBLIC_BS_RENDER_DENSITY);
const FORCED = Number.isFinite(asked) && asked > 0 ? asked : 0;
const SMOOTHING = FORCED > 0 && FORCED < 1 ? 0 : 4;

/** how much smaller than the screen's own grid a view with this limit draws, per side (1 = not at all) */
export function drawScale(density: number, screen: number = PixelRatio.get()): number {
  return Math.min(1, (FORCED || density) / Math.max(1, screen));
}

/** the edge smoothing samples at a graphics level (a forced density keeps its own say) */
export function smoothingAt(smooth: boolean): number {
  return smooth ? SMOOTHING : 0;
}

interface Props {
  /** the most pixels per point worth drawing here: one of `DENSITY` */
  density: number;
  /** what the device can afford now: the surface draws smaller, and without edge smoothing, as it says */
  quality?: Governor;
  onContextCreate: (gl: unknown) => void;
}

const never = () => () => {};
const top = () => 0;

/**
 * A GL view that fills its parent, drawing at most `density` pixels per point.
 * The native view sizes its drawing buffer from its own layout size, so to
 * draw fewer pixels it is laid out smaller inside a holder, and the holder is
 * stretched back over the parent. Touches pass through to whatever is behind.
 *
 * With a `quality` governor the size follows its level while the view lives:
 * the holder changes size and the native view resizes its buffers, so the GL
 * context and everything built on it stay. The view is always in a holder,
 * so a change of level never mounts a new one.
 */
export function GLSurface({ density, quality, onContextCreate }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const level = useSyncExternalStore(quality ? quality.subscribe : never, quality ? () => quality.level : top, top);
  const lv = LEVELS[level];
  const k = drawScale(density) * lv.scale;
  const samples = smoothingAt(lv.smooth);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  // whole points, so the stretch back is exact
  const w = box ? Math.max(1, Math.round(box.w * Math.min(1, k))) : 0;
  const h = box ? Math.max(1, Math.round(box.h * Math.min(1, k))) : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 && box.h > 0 ? (
        <View style={[styles.holder, { left: (box.w - w) / 2, top: (box.h - h) / 2, width: w, height: h, transform: [{ scaleX: box.w / w }, { scaleY: box.h / h }] }]}>
          <GLView style={StyleSheet.absoluteFill} msaaSamples={samples} onContextCreate={onContextCreate} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute' },
});
