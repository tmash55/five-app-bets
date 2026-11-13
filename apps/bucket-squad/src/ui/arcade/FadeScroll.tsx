/**
 * A list that scrolls inside a panel. Where it is cut off and there is more to see, its rows melt into the
 * panel instead of ending on a hard line, and the melt goes once the list has reached that end.
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { fade, night } from '@/theme/arcade';
import { px } from '@/theme/tokens';

/** what a `ref` to the list gives: `scrollTo` and the rest of a scroll view */
export type FadeScrollRef = ComponentRef<typeof Animated.ScrollView>;

export interface FadeScrollProps extends Omit<ScrollViewProps, 'style' | 'onScroll' | 'ref'> {
  /** the colour the list sits on, as `#RRGGBB` (a panel unless told otherwise) */
  on?: string;
  /** how far each melt reaches into the list, in screen points */
  reach?: number;
  /** the box the list fills (where a plain scroll view would take `style`) */
  style?: StyleProp<ViewStyle>;
  ref?: Ref<FadeScrollRef>;
}

const ACROSS = { x: 1, y: 0 } as const;
const DOWN = { x: 0, y: 1 } as const;
const ORIGIN = { x: 0, y: 0 } as const;

export function FadeScroll({ on = night.panel, reach = px(24), horizontal, style, children, ref, onLayout, onContentSizeChange, ...rest }: FadeScrollProps) {
  /** how far the list has been scrolled, how much of it shows, and how long it is: all along the way it scrolls */
  const at = useSharedValue(0);
  const shown = useSharedValue(0);
  const whole = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    at.set(horizontal ? e.contentOffset.x : e.contentOffset.y);
  });
  const before = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, at.value) / reach) }));
  const after = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, whole.value - shown.value - at.value) / reach) }));
  const clear = fade(on, 0);
  const to = horizontal ? ACROSS : DOWN;
  return (
    <View style={style}>
      <Animated.ScrollView
        ref={ref}
        horizontal={horizontal}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => {
          shown.set(horizontal ? e.nativeEvent.layout.width : e.nativeEvent.layout.height);
          onLayout?.(e);
        }}
        onContentSizeChange={(w, h) => {
          whole.set(horizontal ? w : h);
          onContentSizeChange?.(w, h);
        }}
        {...rest}>
        {children}
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[horizontal ? styles.left : styles.top, horizontal ? { width: reach } : { height: reach }, before]}>
        <LinearGradient colors={[on, clear]} start={ORIGIN} end={to} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[horizontal ? styles.right : styles.bottom, horizontal ? { width: reach } : { height: reach }, after]}>
        <LinearGradient colors={[clear, on]} start={ORIGIN} end={to} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  left: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  right: { position: 'absolute', right: 0, top: 0, bottom: 0 },
});
