/**
 * The pack torn open: it shakes harder and harder, the top strip tears off and flies away, light pours out
 * in the colour of the best card inside (a first hint), a flash, and the cards fly out one by one into their
 * places in the row. All of it on one clock, so a tap can jump it to its end.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { PackDef } from '@/meta/packs';
import { halo, night, type Tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CardBack } from '@/ui/arcade/Card';
import { FOIL_RATIO, FoilPack, foilFor } from '@/ui/arcade/Foil';
import { Bloom, Rays, StageRing } from '@/ui/arcade/Room';
import { Glow } from '@/ui/arcade/Type';
import type { OpenLayout, Point } from './layout';
import { backOut, bump, easeInOut, easeOut, lerp, span, wobble } from './motion';
import { around } from './pieces';
import { packTube } from './Sealed';
import { TEAR } from './times';

/** the strip along the top that tears off, as a share of the pack's height */
const STRIP = 0.12;

/** When each card lands in its place in the row. */
export function landings(cards: number): number[] {
  return Array.from({ length: cards }, (_, i) => TEAR.deal + i * TEAR.dealGap + TEAR.fly);
}

function Flyer({ clock, i, from, to, width }: { clock: SharedValue<number>; i: number; from: Point; to: Point; width: number }) {
  const start = TEAR.deal + i * TEAR.dealGap;
  const height = Math.round(width * 1.36);
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, start, start + TEAR.fly);
    if (u <= 0 || u >= 1) return { opacity: 0 };
    const e = easeInOut(u);
    return {
      opacity: 1,
      transform: [{ translateX: (to.x - from.x) * e }, { translateY: (to.y - from.y) * e - px(110) * Math.sin(Math.PI * u) }, { rotate: `${lerp(-320, 0, easeOut(u))}deg` }, { scale: lerp(1.9, 1, e) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.point, { left: from.x, top: from.y }]}>
      <Animated.View style={[around(width, height), style]}>
        <CardBack width={width} />
      </Animated.View>
    </Animated.View>
  );
}

export interface TearProps {
  clock: SharedValue<number>;
  def: PackDef;
  lay: OpenLayout;
  /** the colour of the best card inside */
  light: Tube;
}

export function Tear({ clock, def, lay, light }: TearProps) {
  const { pack } = lay;
  const packH = Math.round(pack.width * FOIL_RATIO);
  const strip = Math.round(packH * STRIP);
  const glow = foilFor(def).glow;
  /** the torn mouth of the pack, on the screen */
  const mouth = { x: pack.x, y: pack.y - packH / 2 + strip };

  const shake = useAnimatedStyle(() => {
    const t = clock.value;
    const s = span(t, 0, TEAR.rip);
    // faster and wider: the angle swings on a phase that speeds up as it goes
    const phase = 0.05 * t + 0.00007 * t * t;
    const wide = t < TEAR.rip ? lerp(1.5, 11, Math.pow(s, 1.5)) : 1.4 * (1 - span(t, TEAR.flash - 200, TEAR.flash));
    const angle = t < TEAR.rip ? Math.sin(phase) * wide : wobble(t, 0.09, 2) * wide;
    const pop = easeOut(span(t, TEAR.flash - 140, TEAR.flash + 60));
    return {
      opacity: 1 - span(t, TEAR.flash, TEAR.flash + 180),
      transform: [{ translateX: t < TEAR.rip ? Math.sin(phase * 1.3) * px(4) * s : 0 }, { rotate: `${angle}deg` }, { scale: 1 + 0.07 * s + 0.12 * pop }],
    };
  });
  const flyOff = useAnimatedStyle(() => {
    const u = span(clock.value, TEAR.rip, TEAR.rip + 560);
    return { opacity: 1 - span(clock.value, TEAR.rip + 320, TEAR.rip + 560), transform: [{ translateX: px(90) * easeOut(u) }, { translateY: -px(190) * easeOut(u) + px(120) * u * u }, { rotate: `${55 * easeOut(u)}deg` }] };
  });
  const raysSize = px(500);
  const pour = useAnimatedStyle(() => {
    const t = clock.value;
    const on = span(t, TEAR.rip, TEAR.rip + 260) * (1 - span(t, TEAR.flash, TEAR.flash + 260));
    return { opacity: on, transform: [{ scale: lerp(0.15, 1.15, easeOut(span(t, TEAR.rip, TEAR.flash))) }, { rotate: `${(t / 1000) * 12}deg` }] };
  });
  const bloom = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: span(t, TEAR.rip, TEAR.flash - 200) * (1 - span(t, TEAR.flash, TEAR.flash + 400)), transform: [{ scale: lerp(0.4, 1.3, easeOut(span(t, TEAR.rip, TEAR.flash))) }] };
  });
  const slit = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: span(t, TEAR.rip, TEAR.rip + 120) * (1 - span(t, TEAR.flash, TEAR.flash + 120)), transform: [{ scaleX: backOut(span(t, TEAR.rip, TEAR.rip + 220)) }] };
  });
  const quiet = useAnimatedStyle(() => ({ opacity: 1 - span(clock.value, TEAR.rip, TEAR.flash) }));
  const flash = useAnimatedStyle(() => ({ opacity: 0.85 * bump(clock.value, TEAR.flash, 50, 420) }));
  const ringW = pack.width * 1.75;
  const ringH = px(56);
  const bloomSize = px(360);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.point, { left: pack.x, top: pack.y }, quiet]}>
        <View style={[around(ringW, ringH), { top: packH / 2 - ringH / 2 + px(6) }]}>
          <StageRing width={ringW} height={ringH} tube={packTube(def)} />
        </View>
        <View style={around(pack.width * 2.6)}>
          <Bloom size={pack.width * 2.6} color={glow} alpha={0.45} />
        </View>
      </Animated.View>
      <View style={[styles.title, { top: lay.frame.top + px(22) }]}>
        <Animated.View style={quiet}>
          <Glow face="display" size="title" tube={packTube(def)} track="wide" center room={lay.screen.width * 0.8}>
            {def.name.toUpperCase()}
          </Glow>
        </Animated.View>
      </View>

      {/* the light, fanning up out of the mouth: only its top half shows, the pack hides the rest */}
      <View style={[styles.fan, { left: mouth.x - raysSize / 2, top: mouth.y - raysSize / 2, width: raysSize, height: raysSize / 2 }]}>
        <Animated.View style={[{ width: raysSize, height: raysSize }, pour]}>
          <Rays size={raysSize} color={light.glass} alpha={0.75} count={16} fill={0.32} fadeAt={[0.15, 0.95]} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.point, { left: mouth.x, top: mouth.y }, bloom]}>
        <View style={around(bloomSize)}>
          <Bloom size={bloomSize} color={light.soft} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.point, { left: pack.x, top: pack.y }, shake]}>
        <View style={around(pack.width, packH)}>
          {/* the pack below the tear */}
          <View style={[styles.clip, { top: strip, width: pack.width, height: packH - strip }]}>
            <View style={{ marginTop: -strip }}>
              <FoilPack pack={def} width={pack.width} flat />
            </View>
          </View>
          <Animated.View style={[styles.slit, { top: strip - px(2), left: pack.width * 0.06, width: pack.width * 0.88, height: px(4), backgroundColor: light.tint, boxShadow: [halo(light.glass, 14, 1, 2)] }, slit]} />
          {/* the strip that tears off */}
          <Animated.View style={[styles.clip, { top: 0, width: pack.width, height: strip }, flyOff]}>
            <FoilPack pack={def} width={pack.width} flat />
          </Animated.View>
        </View>
      </Animated.View>

      {lay.slots.map((to, i) => (
        <Flyer key={i} clock={clock} i={i} from={mouth} to={to} width={lay.slot.width} />
      ))}
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flash]} />
    </View>
  );
}

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fan: {
    position: 'absolute',
    overflow: 'hidden',
  },
  clip: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
  },
  slit: {
    position: 'absolute',
    borderRadius: px(2),
  },
  flash: {
    backgroundColor: night.white,
  },
});

