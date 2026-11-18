/** The Ladder: ranked games against computer squads, eight tiers from Rookie to Legend. */

import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { TIERS, tierProgress } from '@/meta/ladder';
import { packById } from '@/meta/packs';
import { startLadder } from '@/state/play';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night, tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { PickRow, SignHead, type Choice } from '@/ui/arcade/Controls';
import { FadeScroll, type FadeScrollRef } from '@/ui/arcade/FadeScroll';
import { FoilPack } from '@/ui/arcade/Foil';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { TierMedal, tierTube } from '@/ui/arcade/Medal';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { CoinAmount } from '@/ui/arcade/Rewards';
import { Bloom, Rays } from '@/ui/arcade/Room';
import { SegBar } from '@/ui/arcade/SegBar';
import { Chip, NeonPanel, Tag } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

/** the page's own tube */
const TUBE = tube.indigo;
const MEDAL = px(84);
const RAYS = px(230);
const PACK_W = px(18);
/** room for the biggest coin reward, 1,000, so every tier's coin sits in the same place */
const COIN_W = px(58);

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2', lamps: 2 },
  { value: 3, label: '3 on 3', lamps: 3 },
];

export default function Ladder() {
  const router = useRouter();
  const ladder = useSave((s) => s.ladder);
  const format = useSave((s) => s.settings.format);
  const setSetting = useSave((s) => s.setSetting);
  const tp = tierProgress(ladder.points);
  const here = tierTube(tp.index);
  const ahead = tp.next ? tierTube(tp.index + 1) : here;
  const list = useRef<FadeScrollRef>(null);
  const listHeight = useRef(0);

  const play = () => {
    startLadder();
    router.push('/versus');
  };

  // the ladder is drawn the way it is climbed, Legend at the top
  const tiers = TIERS.map((t, i) => ({ t, i })).reverse();

  return (
    <ArcadeScreen title="LADDER" tube="indigo" style={styles.body}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.now}>
            <View>
              <Rays size={RAYS} color={here.glass} alpha={0.3} count={18} fill={0.32} fadeAt={[0.2, 0.9]} style={styles.rays} />
              <Bloom size={RAYS * 0.8} color={here.glass} alpha={0.5} style={styles.bloom} />
              <Arrive delay={60}>
                <TierMedal index={tp.index} size={MEDAL} />
              </Arrive>
            </View>
            <View style={styles.grow}>
              <Print face="bold" size="tiny" color="textFaint" track="widest">
                YOUR TIER
              </Print>
              <Glow face="sign" size="big" tube={here} track="wider">
                {tp.tier.name.toUpperCase()}
              </Glow>
              <View style={styles.chips}>
                <Chip small>
                  <Print face="bold" size="small" color={TUBE.tint} track="wide">{`${ladder.points} POINTS`}</Print>
                </Chip>
                <Chip small>
                  <LineIcon name="trophy" size={px(14)} tube="gold" />
                  <Print face="bold" size="small" color="textSoft" track="wide">{`${ladder.wins} WINS IN ${ladder.games} GAMES`}</Print>
                </Chip>
              </View>
            </View>
          </View>

          {tp.next ? (
            <View style={styles.climb}>
              <View style={styles.climbRow}>
                <TierMedal index={tp.index} size={px(30)} />
                <SegBar value={tp.span > 0 ? (tp.have / tp.span) * 100 : 100} tube={ahead} style={styles.grow} />
                <TierMedal index={tp.index + 1} size={px(30)} lit={false} />
              </View>
              <Print face="medium" size="small" color="textDim">{`${tp.span - tp.have} more points to reach ${tp.next.name}. A loss never drops you below ${tp.tier.name}.`}</Print>
            </View>
          ) : (
            <Print face="medium" size="small" color="textDim">
              You are at the very top of the Ladder!
            </Print>
          )}

          <View style={styles.playRow}>
            <PickRow options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} tube="indigo" style={styles.format} />
            <GoldButton label="PLAY!" icon="play" onPress={play} style={styles.grow} />
          </View>
          <Print face="medium" size="tiny" color="textFaint" center>
            Ladder games are against computer squads that get tougher as you climb.
          </Print>
        </View>

        <Arrive delay={120} from="right" style={styles.right}>
          <NeonPanel tube="indigo" style={styles.panel}>
            <SignHead title="THE LADDER" tube="indigo" />
            {/* a row cut off at either end melts into the panel instead of ending on a hard line */}
            <FadeScroll
              ref={list}
              style={styles.grow}
              contentContainerStyle={styles.tiers}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => {
                listHeight.current = e.nativeEvent.layout.height;
              }}>
              {tiers.map(({ t, i }) => {
                const reached = i <= ladder.bestTier;
                const now = i === tp.index;
                const tb = tierTube(i);
                return (
                  <View
                    key={t.name}
                    onLayout={
                      now
                        ? (e) => {
                            // start with your own tier in the middle of the list
                            const { y, height } = e.nativeEvent.layout;
                            list.current?.scrollTo({ y: Math.max(0, y + height / 2 - listHeight.current / 2), animated: false });
                          }
                        : undefined
                    }
                    style={[styles.tier, now && { borderColor: tb.glass, backgroundColor: night.tile, boxShadow: [halo(tb.glass, 10, 0.6), inner(tb.glass, 14, 0.3)] }]}>
                    <TierMedal index={i} size={px(32)} lit={reached} />
                    <View style={styles.grow}>
                      <Print face="bold" size="body" color={reached ? 'text' : 'textFaint'} lines={1}>
                        {t.name}
                      </Print>
                      <Print face="medium" size="tiny" color="textFaint" lines={1}>{`${t.floor} points`}</Print>
                    </View>
                    {/* a place for the coins and one for the pack on every tier, even one without them, so the coins and packs line up down the list */}
                    <View style={styles.coinSlot}>{t.reward.coins > 0 && <CoinAmount coins={t.reward.coins} size="small" dim={!reached && !now} />}</View>
                    <View style={styles.packSlot}>{t.reward.pack !== undefined && <FoilPack pack={packById(t.reward.pack)} width={PACK_W} flat />}</View>
                    <View style={styles.state}>
                      {now ? (
                        <Breathe depth={0.25}>
                          <Tag label="YOU" tube={tb} small />
                        </Breathe>
                      ) : reached ? (
                        <LineIcon name="check" size={px(18)} tube="green" weight={3} />
                      ) : (
                        <LineIcon name="lock" size={px(16)} color={night.lineLit} />
                      )}
                    </View>
                  </View>
                );
              })}
            </FadeScroll>
          </NeonPanel>
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xl,
  },
  left: {
    flex: 1.25,
    justifyContent: 'center',
    gap: space.md,
  },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingLeft: space.sm,
  },
  rays: {
    position: 'absolute',
    left: (MEDAL - RAYS) / 2,
    top: (MEDAL - RAYS) / 2,
  },
  bloom: {
    position: 'absolute',
    left: (MEDAL - RAYS * 0.8) / 2,
    top: (MEDAL - RAYS * 0.8) / 2,
  },
  grow: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: px(6),
  },
  climb: {
    gap: px(6),
  },
  climbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  format: {
    width: px(180),
  },
  right: {
    flex: 1,
  },
  panel: {
    flex: 1,
    paddingTop: px(10),
    paddingHorizontal: px(10),
    gap: space.sm,
    overflow: 'hidden',
  },
  tiers: {
    gap: px(5),
    paddingBottom: space.md,
  },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: px(8),
    paddingVertical: px(5),
    borderRadius: arcade.rWell,
    borderWidth: arcade.hairline,
    borderColor: night.line,
    backgroundColor: night.well,
  },
  coinSlot: {
    width: COIN_W,
    alignItems: 'flex-start',
  },
  packSlot: {
    width: PACK_W,
    alignItems: 'center',
  },
  state: {
    width: px(38),
    alignItems: 'center',
  },
});
