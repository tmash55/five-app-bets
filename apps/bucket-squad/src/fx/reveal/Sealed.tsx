/**
 * The pack, sealed and waiting: it floats over a lit ring on the stage with rays turning slowly behind it and a
 * few sparkles round it, and a sheen crosses its foil now and then. Its name is lit above it and "TAP TO OPEN"
 * pulses below. With none left, it says so and offers the shop.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { PackDef } from '@/meta/packs';
import { blend, fade, night, type Tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { GoldButton } from '@/ui/arcade/Buttons';
import { FOIL_RATIO, FoilPack, foilFor } from '@/ui/arcade/Foil';
import { Bloom, Rays, StageRing } from '@/ui/arcade/Room';
import { Tag } from '@/ui/arcade/Surface';
import { Glow } from '@/ui/arcade/Type';
import type { OpenLayout } from './layout';
import { easeInOut, span } from './motion';
import { Twinkle, around, useLoop } from './pieces';

/** A pack's foil light as a neon tube, for its name and the ring it floats over. */
export function packTube(def: PackDef): Tube {
  const glow = foilFor(def).glow;
  return { glass: glow, tint: blend(glow, night.white, 0.85), soft: blend(glow, night.white, 0.5) };
}

/** how long one float up and down takes, and how often the sheen crosses */
const BOB = 2600;
const SHEEN = 3800;
const SHEEN_CROSS = 900;
const PULSE = 1500;
const SPARKLE_EVERY = 2400;

/** sparkles round the pack, as shares of its width and height from its middle */
const SPARKLES: readonly (readonly [number, number, number, number])[] = [
  [-0.95, -0.35, 20, 0],
  [0.92, -0.55, 14, 700],
  [-0.85, 0.42, 14, 1300],
  [1.0, 0.25, 18, 1800],
];

/** The pack floating: up and down, swaying a little, a sheen crossing its foil now and then. */
/** how far the pack bobs up and down, worked out here because a worklet can't call `px` */
const BOB_LIFT = px(6);

export function FloatingPack({ def, width, count, dim }: { def: PackDef; width: number; count: number; dim?: boolean }) {
  const height = Math.round(width * FOIL_RATIO);
  const bob = useLoop(BOB);
  const sheen = useLoop(SHEEN);
  const float = useAnimatedStyle(() => {
    const a = (bob.value / BOB) * Math.PI * 2;
    return { transform: [{ translateY: Math.sin(a) * BOB_LIFT }, { rotate: `${Math.sin(a + 1.2) * 1.6}deg` }] };
  });
  const band = width * 0.5;
  const sweep = useAnimatedStyle(() => {
    const u = span(sheen.value, 0, SHEEN_CROSS);
    return { opacity: u > 0 && u < 1 ? 1 : 0, transform: [{ translateX: -band + easeInOut(u) * (width + band * 1.6) }, { rotate: '22deg' }] };
  });
  return (
    <Animated.View style={[{ width, height }, float, dim && styles.dim]}>
      <FoilPack pack={def} width={width} flat={dim} />
      {!dim && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
          <Animated.View style={[styles.sheen, { width: band, height: height * 1.6, top: -height * 0.3 }, sweep]}>
            <LinearGradient colors={SHEEN_COLORS} locations={SHEEN_AT} start={ACROSS_A} end={ACROSS_B} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      )}
      {count > 1 && <Tag label={`x${count}`} tube="pink" style={[styles.count, { top: -px(12), right: -px(16) }]} />}
    </Animated.View>
  );
}

export interface SealedProps {
  def: PackDef;
  lay: OpenLayout;
  /** packs of this kind waiting to be opened */
  count: number;
  /** none left: offer the shop */
  onShop: () => void;
}

export function Sealed({ def, lay, count, onShop }: SealedProps) {
  const tb = packTube(def);
  const glow = foilFor(def).glow;
  const empty = count <= 0;
  const { pack, frame } = lay;
  const packH = Math.round(pack.width * FOIL_RATIO);
  const turn = useLoop(80000);
  const twinkle = useLoop(SPARKLE_EVERY);
  const pulse = useLoop(PULSE);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${(turn.value / 80000) * 360}deg` }] }));
  const call = useAnimatedStyle(() => {
    const s = 0.5 - 0.5 * Math.cos((pulse.value / PULSE) * Math.PI * 2);
    return { opacity: 0.55 + 0.45 * s, transform: [{ scale: 1 + 0.06 * s }] };
  });
  const raysSize = pack.width * 3.8;
  const ringW = pack.width * 1.75;
  const ringH = px(56);
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[styles.point, { left: pack.x, top: pack.y }]}>
        {!empty && (
          <Animated.View style={[around(raysSize), spin]}>
            <Rays size={raysSize} color={glow} alpha={0.2} count={20} fill={0.3} fadeAt={[0.12, 0.9]} />
          </Animated.View>
        )}
        <View style={around(pack.width * 2.6)}>
          <Bloom size={pack.width * 2.6} color={glow} alpha={empty ? 0.2 : 0.5} />
        </View>
        <View style={[around(ringW, ringH), { top: packH / 2 - ringH / 2 + px(6) }]}>
          <StageRing width={ringW} height={ringH} tube={empty ? { glass: night.lineLit, tint: night.textFaint, soft: night.lineLit } : tb} />
        </View>
        <View style={around(pack.width, packH)}>
          <FloatingPack def={def} width={pack.width} count={empty ? 0 : count} dim={empty} />
        </View>
        {!empty && SPARKLES.map(([x, y, size, at], i) => <Twinkle key={i} clock={twinkle} every={SPARKLE_EVERY} at={at} ms={1000} x={x * pack.width} y={y * packH} size={px(size)} color={i % 2 ? tb.tint : night.white} glow={i % 2 ? glow : night.white} />)}
      </View>
      <View pointerEvents="none" style={[styles.title, { top: frame.top + px(22) }]}>
        <Glow face="display" size="title" tube={empty ? 'white' : tb} track="wide" center room={lay.screen.width * 0.8} lit={!empty}>
          {def.name.toUpperCase()}
        </Glow>
      </View>
      <View pointerEvents="box-none" style={[styles.foot, { top: frame.top + frame.height - px(66) }]}>
        {empty ? (
          <View pointerEvents="box-none" style={styles.emptyRow}>
            <Glow face="sign" size="sign" tube="pink" track="wide">
              NO PACKS LEFT
            </Glow>
            <GoldButton size="small" label="GET PACKS" icon="pack" onPress={onShop} accessibilityLabel="Get more packs in the shop" />
          </View>
        ) : (
          <Animated.View pointerEvents="none" style={call}>
            <Glow face="sign" size="title" tube="gold" track="widest" center>
              TAP TO OPEN
            </Glow>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const SHEEN_COLORS = [fade(night.white, 0), fade(night.white, 0.5), fade(night.white, 0)] as const;
const SHEEN_AT = [0, 0.5, 1] as const;
const ACROSS_A = { x: 0, y: 0.5 } as const;
const ACROSS_B = { x: 1, y: 0.5 } as const;

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
  },
  clip: {
    overflow: 'hidden',
    borderRadius: px(3),
  },
  sheen: {
    position: 'absolute',
    left: 0,
  },
  dim: {
    opacity: 0.4,
  },
  count: {
    position: 'absolute',
    transform: [{ rotate: '8deg' }],
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: px(52),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
});

