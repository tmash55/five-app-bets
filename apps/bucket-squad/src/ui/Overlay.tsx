/** A dimmed layer over the screen with a panel that pops in: pause menus, confirmations, pop-ups. */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, duration, layer, size as sizes, space } from '@/theme/tokens';
import { Sticker, type StickerProps } from './Sticker';

export function Overlay({
  children,
  onDismiss,
  soft,
  style,
}: {
  children: React.ReactNode;
  /** tapping outside the panel calls this; leave it out to make the overlay modal */
  onDismiss?: () => void;
  /** a lighter dim, for overlays that should not hide what is behind */
  soft?: boolean;
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
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: soft ? color.scrimSoft : color.scrim }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={onDismiss ? 'Close' : undefined} />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.center,
          { paddingTop: Math.max(insets.top, space.sm), paddingBottom: Math.max(insets.bottom, space.sm), paddingLeft: Math.max(insets.left, space.lg), paddingRight: Math.max(insets.right, space.lg) },
          body,
          style,
        ]}>
        {children}
      </Animated.View>
    </View>
  );
}

/** The paper panel most overlays use. */
export function Panel({ children, width = sizes.panelMax, face, ...rest }: StickerProps & { width?: number }) {
  return (
    <Sticker fill="paper" round="xl" raise="high" {...rest} style={[styles.panelBox, { maxWidth: width }, rest.style]} face={[styles.panel, face]}>
      {children}
    </Sticker>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: layer.modal,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelBox: {
    width: '100%',
    maxHeight: '100%',
  },
  panel: {
    flexShrink: 1,
    padding: space.lg,
    gap: space.md,
  },
});
