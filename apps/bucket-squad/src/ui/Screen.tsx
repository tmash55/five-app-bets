/** The frame every menu screen sits in: a sunny gradient with rays, a header with back, title and coins. */

import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { setMusic } from '@/audio/sound';
import { tapFeedback } from '@/fx/feedback';
import { useSave } from '@/state/save';
import { color, opacity, size as sizes, space, type ColorName } from '@/theme/tokens';
import { CoinPill } from './Bits';
import { IconButton } from './Sticker';
import { StickerText } from './Txt';

export type Tone = 'sky' | 'grape' | 'mint' | 'orange' | 'night' | 'sun' | 'coral';

const TONES: Record<Tone, readonly [ColorName, ColorName]> = {
  sky: ['skyLight', 'sky'],
  grape: ['grape', 'grapeDeep'],
  mint: ['mint', 'mintDeep'],
  orange: ['sun', 'orange'],
  night: ['inkSoft', 'ink'],
  sun: ['sun', 'sunDeep'],
  coral: ['pink', 'coral'],
};

const RAYS = 14;

/** Soft rays fanning up from below the screen, like a comic-book burst. */
export const Sunburst = memo(function Sunburst({ tint = 'white', strength = opacity.pattern }: { tint?: ColorName | (string & {}); strength?: number }) {
  const paths: string[] = [];
  const cx = 50;
  const cy = 62;
  const far = 140;
  for (let i = 0; i < RAYS; i++) {
    const a0 = Math.PI + (i / RAYS) * Math.PI;
    const a1 = a0 + (Math.PI / RAYS) * 0.5;
    paths.push(`M${cx} ${cy} L${(cx + Math.cos(a0) * far).toFixed(1)} ${(cy + Math.sin(a0) * far).toFixed(1)} L${(cx + Math.cos(a1) * far).toFixed(1)} ${(cy + Math.sin(a1) * far).toFixed(1)} Z`);
  }
  const fill = (color as Record<string, string>)[tint] ?? tint;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice">
        <Path d={paths.join(' ')} fill={fill} opacity={strength} />
      </Svg>
    </View>
  );
});

export function Backdrop({ tone = 'sky', rays = true }: { tone?: Tone; rays?: boolean }) {
  const [a, b] = TONES[tone];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[color[a], color[b]]} style={StyleSheet.absoluteFill} />
      {rays && <Sunburst />}
    </View>
  );
}

/** height of the header's row of buttons, without the gap above it */
const HEADER_ROW = sizes.button;

/** The room a screen's content gets under the header: its width and height. */
export function useBodySize(): { width: number; height: number } {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return {
    width: width - Math.max(insets.left, space.lg) - Math.max(insets.right, space.lg),
    height: height - Math.max(insets.top, space.sm) - HEADER_ROW - Math.max(insets.bottom, space.sm),
  };
}

export interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  tone?: Tone;
  /** show a back button (on by default) */
  back?: boolean;
  /** called instead of going back */
  onBack?: () => void;
  /** show the coin count (on by default); a number shows that many instead, for a screen still counting its coins in */
  coins?: boolean | number;
  /** extra header content, left of the coins */
  right?: React.ReactNode;
  /** replaces the title */
  left?: React.ReactNode;
  /** menu music plays on every screen unless this is false */
  music?: boolean;
  /** no backdrop: the screen draws its own behind this frame */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, title, tone = 'sky', back = true, onBack, coins = true, right, left, music = true, bare, style }: ScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coinCount = useSave((s) => s.coins);

  useFocusEffect(
    useCallback(() => {
      if (music) setMusic('menu');
    }, [music]),
  );

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [onBack, router]);

  const padTop = Math.max(insets.top, space.sm);
  const padLeft = Math.max(insets.left, space.lg);
  const padRight = Math.max(insets.right, space.lg);
  return (
    <View style={[styles.root, bare && styles.bare]}>
      {!bare && <Backdrop tone={tone} />}
      <View style={[styles.header, { height: HEADER_ROW + padTop, paddingTop: padTop, paddingLeft: padLeft, paddingRight: padRight }]}>
        <View style={styles.headerSide}>
          {back && (
            <IconButton
              name="back"
              label="Back"
              quiet
              onPress={() => {
                tapFeedback('back');
                goBack();
              }}
            />
          )}
          {left ??
            (title !== undefined && (
              <StickerText size="title" color="white">
                {title}
              </StickerText>
            ))}
        </View>
        <View style={styles.headerSide}>
          {right}
          {coins !== false && <CoinPill coins={typeof coins === 'number' ? coins : coinCount} />}
        </View>
      </View>
      <View style={[styles.body, { paddingLeft: padLeft, paddingRight: padRight, paddingBottom: Math.max(insets.bottom, space.sm) }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.sky,
  },
  bare: {
    backgroundColor: color.clear,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  body: {
    flex: 1,
  },
});
