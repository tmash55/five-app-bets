import { GLView } from 'expo-gl';
import { useState } from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

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

interface Props {
  /** the most pixels per point worth drawing here: one of `DENSITY` */
  density: number;
  onContextCreate: (gl: unknown) => void;
}

/**
 * A GL view that fills its parent, drawing at most `density` pixels per point.
 * The native view sizes its drawing buffer from its own layout size, so to
 * draw fewer pixels it is laid out smaller inside a holder, and the holder is
 * stretched back over the parent. Touches pass through to whatever is behind.
 */
export function GLSurface({ density, onContextCreate }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const k = drawScale(density);

  if (k >= 1) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <GLView style={StyleSheet.absoluteFill} msaaSamples={SMOOTHING} onContextCreate={onContextCreate} />
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  // whole points, so the stretch back is exact
  const w = box ? Math.max(1, Math.round(box.w * k)) : 0;
  const h = box ? Math.max(1, Math.round(box.h * k)) : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 && box.h > 0 ? (
        <View style={[styles.holder, { left: (box.w - w) / 2, top: (box.h - h) / 2, width: w, height: h, transform: [{ scaleX: box.w / w }, { scaleY: box.h / h }] }]}>
          <GLView style={StyleSheet.absoluteFill} msaaSamples={SMOOTHING} onContextCreate={onContextCreate} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute' },
});
