/**
 * The frame every menu page sits in: the arcade's wall, and a dark strip along the top
 * with the way back, the page's name in neon, and the coin count.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setMusic } from '@/audio/sound';
import { useSave } from '@/state/save';
import { arcade, night, tube as tubes, type Tube, type TubeName } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { useCountUp } from '../Bits';
import { RoundButton } from './Buttons';
import { Coin } from './LineIcon';
import { Wall } from './Room';
import { Chip } from './Surface';
import { Glow, Print } from './Type';

/** the gap a page keeps at its left and right edges */
const EDGE = px(18);
/** the strip and the line under it */
const BAR = arcade.bar + arcade.barLine;

/** The coins the player has, in the top bar. Counts up or down to a new amount. */
export function CoinChip({ coins, style }: { coins: number; style?: StyleProp<ViewStyle> }) {
  const shown = useCountUp(coins);
  return (
    <Chip style={[styles.coins, style]}>
      <Coin size={px(20)} />
      <Print face="bold" size="large" color={tubes.gold.glass} track="wider" glow={tubes.gold.glass} lines={1}>
        {shown.toLocaleString('en-US')}
      </Print>
    </Chip>
  );
}

/** The room a page's content gets under the top bar: its width and height. */
export function useArcadeBody(): { width: number; height: number } {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return {
    width: width - Math.max(insets.left, EDGE) - Math.max(insets.right, EDGE),
    height: height - insets.top - BAR - Math.max(insets.bottom, space.sm),
  };
}

/**
 * The gap the frame keeps at a page's left and right edges: past a phone's notch, and never less than the page's own margin.
 * A row that scrolls sideways takes these back with negative margins and gives them to its content as padding,
 * so its cards slide out under the notch instead of ending on a line in mid-air.
 */
export function useArcadeEdges(): { left: number; right: number } {
  const insets = useSafeAreaInsets();
  return { left: Math.max(insets.left, EDGE), right: Math.max(insets.right, EDGE) };
}

/** the gap a page asked to keep at its bottom edge, if its style names one */
function bottomAsked(style: StyleProp<ViewStyle>): number | undefined {
  const flat = StyleSheet.flatten(style);
  for (const key of ['paddingBottom', 'paddingVertical', 'padding'] as const) {
    const v = flat?.[key];
    if (typeof v === 'number') return v;
  }
  return undefined;
}

export interface ArcadeScreenProps {
  children: React.ReactNode;
  /** the page's name, lit in the top bar */
  title?: string;
  /** the tube the name is bent from */
  tube?: TubeName | Tube;
  /** show the way back (on by default) */
  back?: boolean;
  /** called instead of going back */
  onBack?: () => void;
  /** show the coin count (on by default); a number shows that many instead, for a page still counting its coins in */
  coins?: boolean | number;
  /** replaces the title */
  left?: React.ReactNode;
  /** more in the bar, after the title */
  after?: React.ReactNode;
  /** more in the bar, before the coins */
  right?: React.ReactNode;
  /** menu music plays on every page unless this is false */
  music?: boolean;
  /** no wall: the page draws its own behind this frame */
  bare?: boolean;
  /** no strip behind the bar's buttons, and the page's content reaches up behind them; taps go through where the bar is empty */
  barless?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ArcadeScreen({ children, title, tube: t = 'pink', back = true, onBack, coins = true, left, after, right, music = true, bare, barless, style }: ArcadeScreenProps) {
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

  const padLeft = Math.max(insets.left, EDGE);
  const padRight = Math.max(insets.right, EDGE);
  return (
    <View style={[styles.root, bare && styles.bare]}>
      {!bare && <Wall />}
      <View pointerEvents="box-none" style={[styles.bar, barless ? styles.barless : styles.barStrip, { height: BAR + insets.top, paddingTop: insets.top, paddingLeft: padLeft - (back ? BACK_INSET : 0), paddingRight: padRight }]}>
        <View pointerEvents="box-none" style={styles.side}>
          {back && <RoundButton icon="back" label="Back" tube="cyan" sound="back" onPress={goBack} />}
          {left ??
            (title !== undefined && (
              <Glow tube={t} size="title">
                {title}
              </Glow>
            ))}
          {after}
        </View>
        <View pointerEvents="box-none" style={styles.side}>
          {right}
          {coins !== false && <CoinChip coins={typeof coins === 'number' ? coins : coinCount} />}
        </View>
      </View>
      {/* a page may ask for more room at the bottom, never for less than the phone's home bar takes */}
      <View style={[styles.body, { paddingLeft: padLeft, paddingRight: padRight }, style, { paddingBottom: Math.max(insets.bottom, bottomAsked(style) ?? space.sm) }]}>{children}</View>
    </View>
  );
}

/** the back button is a small circle in a full-size place to tap: pull it left so the circle, not the tap area, lines up with the page's edge */
const BACK_INSET = px(5);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: night.wallTop,
  },
  bare: {
    backgroundColor: night.clear,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    zIndex: 1,
  },
  barStrip: {
    backgroundColor: night.bar,
    borderBottomWidth: arcade.barLine,
    borderBottomColor: night.line,
  },
  barless: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
  coins: {
    gap: px(7),
    paddingLeft: px(7),
  },
  body: {
    flex: 1,
  },
});
