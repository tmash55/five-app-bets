/** A dimmed layer over a menu page with a lit panel that pops in: confirmations and pop-ups. (The match keeps ui/Overlay.) */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { night, type Tube, type TubeName } from '@/theme/arcade';
import { duration, layer, px, size as sizes, space } from '@/theme/tokens';
import { NeonPanel } from './Surface';

export function Popup({
  children,
  onDismiss,
  tube = 'cyan',
  width = sizes.panelMax,
  style,
}: {
  children: React.ReactNode;
  /** tapping outside the panel calls this; leave it out to make the pop-up modal */
  onDismiss?: () => void;
  tube?: TubeName | Tube;
  /** the widest the panel gets, in screen points */
  width?: number;
  /** the panel's own style (padding, layout of the children) */
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const show = useSharedValue(0);
  const pop = useSharedValue(0.9);
  useEffect(() => {
    show.set(withTiming(1, { duration: duration.normal }));
    pop.set(withSpring(1, { damping: 14, stiffness: 240, mass: 0.8 }));
  }, [show, pop]);
  const scrim = useAnimatedStyle(() => ({ opacity: show.value }));
  const body = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ scale: pop.value }] }));
  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={onDismiss ? 'Close' : undefined} />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.center, { paddingTop: Math.max(insets.top, space.sm), paddingBottom: Math.max(insets.bottom, space.sm), paddingLeft: Math.max(insets.left, space.lg), paddingRight: Math.max(insets.right, space.lg) }, body]}>
        <NeonPanel tube={tube} style={[styles.panel, { maxWidth: width }, style]}>
          {children}
        </NeonPanel>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: layer.modal,
  },
  scrim: {
    backgroundColor: night.scrim,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '100%',
    maxHeight: '100%',
    padding: px(16),
    gap: space.md,
  },
});
