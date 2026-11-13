/**
 * What a revealed card says about its player, coming in piece by piece beside it: what happened (NEW!, a
 * level up), the rarity as a sign that flickers on, the card's number, the name and overall, the team and
 * role, the blurb, the three best ratings as lamps that light one at a time, how much of the team the child
 * now has, and the yellow button on to the next card.
 */

import { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { RARITIES, RARITY_LABEL } from '@/data/types';
import { neonText, rarityPaint, track, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { useCountUp } from '@/ui/Bits';
import { GoldButton } from '@/ui/arcade/Buttons';
import { Gems } from '@/ui/arcade/Card';
import { Coin } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL, fitPerson, fitTo, widthOf } from '@/ui/arcade/measure';
import { Pips, SegBar, StatRow, lampsFor } from '@/ui/arcade/SegBar';
import { Chip, OvrBox, Tag } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';
import { backOut, easeOut, flicker, span } from './motion';
import type { CardPlan } from './plan';
import { INFO } from './times';

/**
 * One piece of the side, fading and sliding in at `at` on the info clock. Only the button takes touches: a tap
 * anywhere else on the words goes through to the stage behind and moves on, as a tap anywhere does.
 */
/** how far each piece slides in, and how far each letter of LEGEND drops (worked out here: a worklet can't call `px`) */
const PIECE_SLIDE = px(28);
const LETTER_FALL = px(40);

function Piece({ clock, at, children, style, touch, onLayout }: { clock: SharedValue<number>; at: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; touch?: boolean; onLayout?: (e: LayoutChangeEvent) => void }) {
  const anim = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + INFO.piece);
    return { opacity: u, transform: [{ translateX: (1 - easeOut(u)) * PIECE_SLIDE }] };
  });
  return (
    <Animated.View pointerEvents={touch ? 'box-none' : 'none'} style={[style, anim]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

const GEM = px(11);
const SIGN_FLICKER = 560;
/** each letter of LEGEND drops in this long after the last */
const LETTER_GAP = 95;
const LETTER_DROP = 300;

function Letter({ clock, at, size, children }: { clock: SharedValue<number>; at: number; size: number; children: string }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + LETTER_DROP);
    return { opacity: Math.min(1, u * 3), transform: [{ translateY: -LETTER_FALL * (1 - backOut(u, 2.2)) }] };
  });
  return (
    <Animated.View style={style}>
      <Glow face="sign" size={size} tube="amber" track="none" tight>
        {children}
      </Glow>
    </Animated.View>
  );
}

/** The rarity as a lit sign: a tube that stutters on, or for a Legend its letters dropping in one at a time. */
function RaritySign({ plan, clock, size }: { plan: CardPlan; clock: SharedValue<number>; size: number }) {
  const word = RARITY_LABEL[plan.rarity].toUpperCase();
  const tb = rarityPaint[plan.rarity].tube;
  const lit = useAnimatedStyle(() => ({ opacity: flicker(clock.value, INFO.sign, SIGN_FLICKER) }));
  const gems = useAnimatedStyle(() => ({ opacity: span(clock.value, INFO.sign + SIGN_FLICKER * 0.4, INFO.sign + SIGN_FLICKER) }));
  return (
    <View style={styles.sign}>
      {plan.rarity === 'legend' ? (
        <View style={styles.letters}>
          {word.split('').map((ch, i) => (
            <Letter key={i} clock={clock} at={INFO.sign + i * LETTER_GAP} size={size}>
              {ch}
            </Letter>
          ))}
        </View>
      ) : (
        <View>
          <Glow face="sign" size={size} tube={tb} track="widest" tight lit={false}>
            {word}
          </Glow>
          <Animated.View style={[StyleSheet.absoluteFill, lit]}>
            <Glow face="sign" size={size} tube={tb} track="widest" tight>
              {word}
            </Glow>
          </Animated.View>
        </View>
      )}
      <Animated.View style={gems}>
        <Gems rarity={plan.rarity} size={GEM} />
      </Animated.View>
    </View>
  );
}

/**
 * How big the rarity sign can be: it shares its line with the tag and the card's number, and a long tag
 * ("LEVEL UP! LV 3") must not push the number off the side, so the sign gives way. The tag and the number are
 * measured once they are laid out; until then their widths are worked out from their words.
 */
function signSize(plan: CardPlan, number: string, width: number, sides: { tag: number; chip: number }): number {
  const tag = sides.tag || widthOf(plan.label.text, 'display', neonText.body, track.close) + px(9) * 2 + px(8);
  const chip = sides.chip || widthOf(number, 'bold', px(12.5), track.wide) + px(9) * 2 + px(8);
  const gems = (RARITIES.indexOf(plan.rarity) + 1) * GEM * 1.25 + px(8);
  const room = width - tag - chip - gems - GAP * 2 - px(6);
  const word = RARITY_LABEL[plan.rarity].toUpperCase();
  return plan.rarity === 'legend' ? fitTo(word, 'sign', neonText.big, room - (word.length - 1) * px(3), 0, MIN_FIT_LABEL) : fitTo(word, 'sign', neonText.big, room, track.widest, MIN_FIT_LABEL);
}

/** the overall rating box, and the room the name leaves beside it */
const OVR_W = px(62);
const GAP = px(12);

/** How many lamps each of the three ratings lights, and where each row's lamps start in the count. */
export function lampPlan(plan: CardPlan): { each: number[]; from: number[]; total: number } {
  const each = plan.stats.map((s) => lampsFor(s.value));
  const from: number[] = [];
  let n = 0;
  for (const k of each) {
    from.push(n);
    n += k;
  }
  return { each, from, total: n };
}

export interface CardInfoProps {
  plan: CardPlan;
  /** milliseconds since the card turned face-up */
  clock: SharedValue<number>;
  /** rating lamps lit so far, counted across the three rows */
  lamps: number;
  /** the team's lamps lit so far */
  pips: number;
  /** the overall rating has started counting up */
  counting: boolean;
  last: boolean;
  onNext: () => void;
  width: number;
}

export const CardInfo = memo(function CardInfo({ plan, clock, lamps, pips, counting, last, onNext, width }: CardInfoProps) {
  const { player, rarity, gain } = plan;
  const tb = rarityPaint[rarity].tube;
  const room = width - OVR_W - GAP;
  const name = fitPerson(player.name.toUpperCase(), 'display', px(37), room, track.close, player.short?.toUpperCase());
  const shownOvr = useCountUp(counting ? plan.overall : 0, 700);
  const lp = lampPlan(plan);
  const nick = player.nickname ? ` · “${player.nickname.toUpperCase()}”` : '';
  const copy = !gain.isNew;
  const number = `NO. ${plan.number.number} OF ${plan.number.of}`;
  const [sides, setSides] = useState({ tag: 0, chip: 0 });
  const measure = (key: 'tag' | 'chip') => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setSides((was) => (was[key] === w ? was : { ...was, [key]: w }));
  };
  return (
    <View pointerEvents="box-none" style={[styles.root, { width }]}>
      <View pointerEvents="none" style={styles.top}>
        <Piece clock={clock} at={INFO.tag} onLayout={measure('tag')}>
          <Tag label={plan.label.text} tube={plan.label.tube} />
        </Piece>
        <Piece clock={clock} at={INFO.sign - 60} style={styles.shrink}>
          <RaritySign plan={plan} clock={clock} size={signSize(plan, number, width, sides)} />
        </Piece>
        <Piece clock={clock} at={INFO.chip} style={styles.push} onLayout={measure('chip')}>
          <Chip small>
            <Print face="bold" size={px(12.5)} color="textDim" track="wide" lines={1}>
              {number}
            </Print>
          </Chip>
        </Piece>
      </View>

      <View pointerEvents="none" style={styles.block}>
        <View style={styles.grow}>
          <Piece clock={clock} at={INFO.name}>
            <Print face="display" size={name.size} track="close" lines={1} style={{ lineHeight: Math.round(name.size * 1.08) }}>
              {name.text}
            </Print>
          </Piece>
          <Piece clock={clock} at={INFO.line}>
            <Print face="bold" size={px(13)} color={tube.cyan.soft} track="wide" room={room} upper>
              {`${plan.team.name} · ${player.role}${nick}`}
            </Print>
          </Piece>
          <Piece clock={clock} at={INFO.blurb} style={styles.blurb}>
            <Print face="medium" size="body" color="textSoft" lines={3}>
              {player.blurb}
            </Print>
          </Piece>
        </View>
        <View style={styles.side}>
          <Piece clock={clock} at={INFO.ovr}>
            <OvrBox value={shownOvr} tube={tb} />
          </Piece>
          {copy && (
            <Piece clock={clock} at={INFO.ovr + 80} style={styles.level}>
              {gain.coins > 0 ? (
                <View style={styles.coins}>
                  <Coin size={px(14)} />
                  <Print face="bold" size="small" color={tube.gold.glass} track="normal">{`+${gain.coins}`}</Print>
                </View>
              ) : (
                <>
                  <Print face="bold" size="micro" color="textDim" track="wider">{`LV ${plan.level}`}</Print>
                  {!plan.progress.maxed && <SegBar lamps={plan.progress.need} lit={plan.progress.have} tube="green" small style={styles.levelBar} />}
                </>
              )}
            </Piece>
          )}
        </View>
      </View>

      <Piece clock={clock} at={INFO.stats} style={styles.stats}>
        {plan.stats.map((s, i) => {
          const lit = Math.max(0, Math.min(lp.each[i], lamps - lp.from[i]));
          const full = lit >= lp.each[i];
          return <StatRow key={s.key} label={s.label} value={s.value} lit={lit} shown={full ? s.value : Math.round((s.value * lit) / Math.max(1, lp.each[i]))} />;
        })}
      </Piece>

      <Piece clock={clock} at={INFO.stats + 60} style={styles.team}>
        <Print face="bold" size={px(12.5)} color="textDim" track="wide" lines={1} upper>{`YOUR ${plan.team.name}`}</Print>
        <Pips have={pips} of={plan.team.of} />
        <Print face="bold" size={px(12.5)} color={tube.cyan.soft} track="wide" lines={1}>{`${pips} OF ${plan.team.of}`}</Print>
      </Piece>

      <Piece clock={clock} at={INFO.button} touch>
        <GoldButton label={last ? 'SEE ALL' : 'NEXT PLAYER'} iconAfter="arrow" onPress={onNext} accessibilityLabel={last ? 'See all your new players' : 'Next player'} />
      </Piece>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: px(10),
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    minHeight: Math.round(neonText.big * 1.04),
  },
  push: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  shrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  sign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(8),
  },
  letters: {
    flexDirection: 'row',
    gap: px(3),
  },
  block: {
    flexDirection: 'row',
    gap: GAP,
  },
  grow: {
    flex: 1,
    minWidth: 0,
    gap: px(4),
  },
  blurb: {
    marginTop: px(4),
  },
  side: {
    width: OVR_W,
    alignItems: 'center',
    gap: px(6),
  },
  level: {
    alignItems: 'center',
    gap: px(3),
  },
  levelBar: {
    width: OVR_W,
  },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(4),
  },
  stats: {
    gap: px(7),
  },
  team: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
});
