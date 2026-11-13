/** The Ladder: ranked games against computer squads, eight tiers from Rookie to Legend. */

import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TIERS, tierProgress } from '@/meta/ladder';
import { packById } from '@/meta/packs';
import { startLadder } from '@/state/play';
import { useSave } from '@/state/save';
import { color, size as sizes, space, stroke } from '@/theme/tokens';
import { ProgressBar, Tag } from '@/ui/Bits';
import { Icon } from '@/ui/Icon';
import { Segmented, type Choice } from '@/ui/Inputs';
import { PackArt } from '@/ui/PackArt';
import { CoinAmount } from '@/ui/Rewards';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2' },
  { value: 3, label: '3 on 3' },
];

export default function Ladder() {
  const router = useRouter();
  const ladder = useSave((s) => s.ladder);
  const format = useSave((s) => s.settings.format);
  const setSetting = useSave((s) => s.setSetting);
  const tp = tierProgress(ladder.points);

  const play = () => {
    startLadder();
    router.push('/versus');
  };

  return (
    <Screen title="LADDER" tone="grape">
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.now}>
            <View style={[styles.medal, { backgroundColor: color[tp.tier.color] }]}>
              <Icon name="trophy" size={sizes.iconHuge} color="white" />
            </View>
            <View style={styles.grow}>
              <StickerText size="big" color="white">
                {tp.tier.name.toUpperCase()}
              </StickerText>
              <Txt font="display" size="body" color="white" shadow>{`${ladder.points} points  ·  ${ladder.wins} wins in ${ladder.games} games`}</Txt>
            </View>
          </View>
          {tp.next ? (
            <View style={styles.bar}>
              <ProgressBar value={tp.span > 0 ? tp.have / tp.span : 1} fill={tp.next.color} height={sizes.barThick} />
              <Txt size="small" color="white" shadow>{`${tp.span - tp.have} more points to reach ${tp.next.name}. A loss never drops you below ${tp.tier.name}.`}</Txt>
            </View>
          ) : (
            <Txt size="small" color="white" shadow>
              You are at the very top of the Ladder!
            </Txt>
          )}
          <View style={styles.playRow}>
            <Segmented options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} style={styles.format} />
            <StickerButton label="PLAY!" icon="play" iconColor="white" fill="mint" textSize="title" raise="high" height={sizes.buttonLarge} onPress={play} style={styles.grow} />
          </View>
          <Txt size="tiny" color="white" center>
            Ladder games are against computer squads that get tougher as you climb.
          </Txt>
        </View>

        <ScrollView style={styles.tiers} contentContainerStyle={styles.tiersBody} showsVerticalScrollIndicator={false}>
          {TIERS.map((t, i) => {
            const reached = i <= ladder.bestTier;
            const here = i === tp.index;
            return (
              <Sticker key={t.name} fill={here ? 'sun' : reached ? 'white' : 'paper'} round="md" raise={here ? 'low' : 'none'} border={stroke.thin} face={styles.tier}>
                <View style={[styles.tierMedal, { backgroundColor: color[t.color] }]}>
                  <Icon name="trophy" size={sizes.iconSmall} color="white" />
                </View>
                <View style={styles.grow}>
                  <Txt font="display" size="body" lines={1}>
                    {t.name}
                  </Txt>
                  <Txt size="tiny" color="inkSoft">{`${t.floor} points`}</Txt>
                </View>
                {t.reward.coins > 0 && <CoinAmount coins={t.reward.coins} size="small" />}
                {t.reward.pack !== undefined && <PackArt pack={packById(t.reward.pack)} width={sizes.badgeTiny} />}
                {here ? <Tag label="You" fill="ink" textColor="white" style={styles.centerSelf} /> : reached ? <Icon name="check" size={sizes.iconSmall} color="mint" /> : <Icon name="lock" size={sizes.iconSmall} color="paper" ink="inkFaint" />}
              </Sticker>
            );
          })}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xl,
  },
  left: {
    flex: 1.25,
    justifyContent: 'center',
    gap: space.sm,
  },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  medal: {
    width: sizes.avatarLarge + space.md,
    height: sizes.avatarLarge + space.md,
    borderRadius: (sizes.avatarLarge + space.md) / 2,
    borderWidth: stroke.thick,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: {
    flex: 1,
  },
  bar: {
    gap: space.xs,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
  },
  format: {
    width: sizes.cardLarge,
  },
  tiers: {
    flex: 1,
  },
  tiersBody: {
    gap: space.xs,
    paddingBottom: space.md,
  },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  tierMedal: {
    width: sizes.badgeSmall + space.xs,
    height: sizes.badgeSmall + space.xs,
    borderRadius: (sizes.badgeSmall + space.xs) / 2,
    borderWidth: stroke.thin,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
});
