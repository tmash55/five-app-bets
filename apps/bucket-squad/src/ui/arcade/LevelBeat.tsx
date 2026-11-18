/**
 * A copy's beat in a pop-up: the Daily Shop after buying a player, or a game's prize player. The same beat the
 * pack opening plays: one more lamp on the copies bar, and when that fills it, a level up: the card's frame
 * upgrades in place, the level lamp lights, the gold rating lamps the level lit come on one by one and the overall
 * counts up, with the level-up sound. A copy that does not level up still lights its lamp and sparkles: never a dud.
 *
 * `useCopyBeat` runs the beat's clock; `CopyMeter` shows it beside the card; `finish` jumps it to its end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Easing, ReduceMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { playSfx, warmSounds } from '@/audio/sound';
import { MAX_LEVEL } from '@/data/roster';
import { buzz } from '@/fx/feedback';
import { lampPlan, planCard, type CardPlan } from '@/fx/reveal/plan';
import { BEAT } from '@/fx/reveal/times';
import type { Gain } from '@/meta/collection';
import { levelPaint, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { useCountUp } from '@/ui/Bits';
import { useAfter } from '@/ui/hooks';
import type { Beat } from './levels';
import { Bump } from './Motion';
import { Pips, SegBar, StatRow } from './SegBar';
import { Glow, Print } from './Type';

const LEVEL = tubes[levelPaint.tube];

export interface CopyBeat {
  /** what the copy did and everything shown about it, or null for a new player, coins or a uniform */
  plan: CardPlan | null;
  beat: Beat;
  /** the gold lamps lit so far, across the three ratings */
  gained: number;
  /** the card's frame upgrading, 0 to 1: give it to the card with `levelFrom` */
  levelUp: SharedValue<number>;
  /** everything at its end at once */
  finish: () => void;
}

/**
 * The beat for a copy that just came in. `copies` is the count once it is in. It starts `startAt` ms after the
 * pop-up opens, once the card has landed.
 */
export function useCopyBeat(gain: Gain | undefined, copies: number, startAt = 560): CopyBeat {
  const after = useAfter();
  const levelUp = useSharedValue(0);
  const [beat, setBeat] = useState<Beat>(0);
  const [gained, setGained] = useState(0);
  const done = useRef(false);
  const played = useRef(false);
  // planned once, from the copy as it came in: the save moving on afterwards does not change what is shown
  const [plan] = useState<CardPlan | null>(() => {
    if (!gain) return null;
    const p = planCard(gain, { [gain.playerId]: Math.max(1, copies) });
    return p.kind === 'copy' || p.kind === 'levelUp' ? p : null;
  });
  const lp = useMemo(() => (plan ? lampPlan(plan) : null), [plan]);

  useEffect(() => {
    if (!plan || !lp) return;
    warmSounds(['lampTick', 'levelUp', 'sparkle']);
    const live = () => !done.current;
    after(startAt, () => {
      if (!live()) return;
      setBeat(1);
      playSfx('lampTick');
      if (plan.kind === 'copy') playSfx('sparkle', 0.55);
    });
    if (plan.kind !== 'levelUp') return;
    const upAt = startAt + BEAT.fill;
    after(upAt, () => {
      if (!live()) return;
      setBeat(2);
      played.current = true;
      playSfx('levelUp');
      buzz('success');
      levelUp.set(withTiming(1, { duration: BEAT.frame, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }));
    });
    for (let k = 1; k <= lp.gained; k++) {
      after(upAt + BEAT.lamps + (k - 1) * BEAT.lampGap, () => {
        if (!live()) return;
        setGained(k);
        playSfx('lampTick', 0.6 + (0.4 * k) / lp.gained);
      });
    }
  }, [plan, lp, after, startAt, levelUp]);

  const finish = useCallback(() => {
    if (!plan || !lp || done.current) return;
    done.current = true;
    if (plan.kind === 'copy') {
      setBeat(1);
      return;
    }
    setBeat(2);
    setGained(lp.gained);
    levelUp.set(1);
    if (!played.current) {
      played.current = true;
      playSfx('levelUp');
    }
  }, [plan, lp, levelUp]);

  return { plan, beat, gained, levelUp, finish };
}

/**
 * What the copy did, beside the card: the level as gold lamps and the overall; then either the copies bar with its
 * new lamp ("2 OF 3"), or for a level up the three best ratings with the lamps the level lit coming on in gold.
 */
export function CopyMeter({ plan, beat, gained, width }: { plan: CardPlan; beat: Beat; gained: number; width: number }) {
  const up = plan.kind === 'levelUp';
  const leveled = up && beat >= 2;
  const level = leveled ? plan.level : plan.levelBefore;
  const ovr = useCountUp(up && !leveled ? plan.overallBefore : plan.overall, 700);
  const bar = up ? plan.progressBefore : plan.progress;
  const lit = up ? Math.min(bar.need, bar.have + (beat >= 1 ? 1 : 0)) : Math.max(0, bar.have - (beat >= 1 ? 0 : 1));
  const lp = lampPlan(plan);
  const next = plan.progress.maxed ? 'TOP LEVEL!' : `${plan.progress.need - plan.progress.have} MORE TO LV ${plan.level + 1}`;
  return (
    <View style={[styles.root, { width }]}>
      <View accessible accessibilityLabel={`Level ${level} of ${MAX_LEVEL}, ${ovr} overall`} style={styles.row}>
        <Bump beat={leveled ? 1 : 0} amount={0.25}>
          {leveled ? (
            <Glow face="display" size="large" tube={levelPaint.tube} track="close">{`LV ${level}`}</Glow>
          ) : (
            <Print face="display" size="large" color="textDim" track="close">{`LV ${level}`}</Print>
          )}
        </Bump>
        <Pips have={level} of={MAX_LEVEL} tube={levelPaint.tube} size={px(11)} />
        <View style={styles.push}>
          <Print face="bold" size="micro" color="textDim" track="wider">
            OVR
          </Print>
          <Print face="display" size="large" color={leveled ? LEVEL.tint : 'text'}>
            {String(ovr)}
          </Print>
        </View>
      </View>
      {up && leveled ? (
        <View style={styles.stats}>
          {plan.stats.map((s, i) => {
            const row = plan.lamps[i];
            const more = Math.max(0, Math.min(lp.gain[i], gained - lp.gainFrom[i]));
            return <StatRow key={s.key} label={s.label} value={s.value} lit={row.before + more} levelFrom={row.levelFrom} bonus={s.value - plan.player.ratings[s.key]} shown={more >= lp.gain[i] ? s.value : row.valueBefore} small />;
          })}
        </View>
      ) : (
        <View accessible accessibilityLabel={`${lit} of ${bar.need} copies to level ${level + 1}`} style={styles.row}>
          <Print face="bold" size="tiny" color="textDim" track="wide">
            COPIES
          </Print>
          <Bump beat={beat >= 1 ? 1 : 0} amount={0.12} style={styles.grow}>
            <SegBar lamps={bar.need} lit={lit} tube="green" small />
          </Bump>
          <Print face="bold" size="tiny" color={beat >= 1 ? tubes.green.soft : 'textDim'} track="normal">{`${lit} OF ${bar.need}`}</Print>
        </View>
      )}
      {!up && (
        <Print face="bold" size="tiny" color={beat >= 1 ? tubes.green.soft : 'textFaint'} track="normal">
          {next}
        </Print>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: px(6),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
  push: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: px(5),
  },
  grow: {
    flex: 1,
  },
  stats: {
    gap: px(4),
  },
});
