/** Home: your squad on one side, everything you can do on the other. */

import { Image } from 'expo-image';
import { Redirect, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PLAYERS, cardArt, mustPlayer, playerOverall } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { countOwned, levelOf } from '@/meta/collection';
import { currentMissions, missionsToClaim } from '@/meta/missions';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { color, size as sizes, space, type ColorName } from '@/theme/tokens';
import { Dot, Tag } from '@/ui/Bits';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { IconButton, Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

const ALL_IDS = PLAYERS.map((p) => p.id);

function Tile({ label, sub, icon, fill, count = 0, tag, onPress }: { label: string; sub: string; icon: IconName; fill: ColorName; count?: number; tag?: string; onPress: () => void }) {
  return (
    <View style={styles.tile}>
      <StickerButton fill={fill} round="lg" onPress={onPress} accessibilityLabel={`${label}. ${sub}`} face={styles.tileFace}>
        <Icon name={icon} size={sizes.iconLarge} color="white" />
        <View style={styles.tileText}>
          <Txt font="display" size="large" color="white" shadow lines={1}>
            {label}
          </Txt>
          <Txt size="small" color="ink" lines={1}>
            {sub}
          </Txt>
        </View>
      </StickerButton>
      <Dot count={count} />
      {tag !== undefined && <Tag label={tag} fill="coral" textColor="white" style={styles.tileTag} />}
    </View>
  );
}

/** The three players in your squad, standing together. */
function SquadStage({ ids, onPress }: { ids: string[]; onPress: () => void }) {
  // captain in the middle and a step in front
  const order = ids.length >= 3 ? [ids[1], ids[0], ids[2]] : ids;
  return (
    <Pressable
      style={styles.stage}
      accessibilityRole="button"
      accessibilityLabel="Your squad. Tap to change it."
      onPress={() => {
        tapFeedback();
        onPress();
      }}>
      <View style={styles.floor} />
      <View style={styles.figures}>
        {order.map((id) => {
          const art = cardArt(id);
          return (
            <View key={id} style={[styles.figure, id === ids[0] ? styles.figureLead : styles.figureSide]}>
              {art !== undefined && <Image source={art} style={styles.fill} contentFit="contain" contentPosition="bottom" transition={0} />}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const onboarded = useSave((s) => s.onboarded);
  const squad = useSave((s) => s.squad);
  const owned = useSave((s) => s.owned);
  const packs = useSave((s) => s.packs);
  const fresh = useSave((s) => s.fresh);
  const missions = useSave((s) => s.missions);
  const freePackDay = useSave((s) => s.freePackDay);

  if (!onboarded || squad.length === 0) return <Redirect href="/welcome" />;

  const today = dayKey();
  const packCount = Object.values(packs).reduce((a, n) => a + n, 0);
  const freePack = freePackDay !== today;
  const toClaim = missionsToClaim(currentMissions(missions, today));
  const have = countOwned(owned, ALL_IDS);
  const squadOvr = Math.round(squad.reduce((a, id) => a + playerOverall(mustPlayer(id), levelOf(owned[id] ?? 1)), 0) / squad.length);
  const go = (href: Href) => () => router.push(href);

  return (
    <Screen
      back={false}
      left={
        <StickerText size="title" color="sun">
          BUCKET SQUAD
        </StickerText>
      }
      right={<IconButton name="gear" label="Settings" onPress={go('/settings')} />}>
      <View style={styles.row}>
        <View style={styles.left}>
          <SquadStage ids={squad} onPress={go('/squad')} />
          <Sticker fill="paper" round="pill" raise="low" style={styles.squadPill} face={styles.squadPillFace}>
            <Icon name="crown" size={sizes.iconSmall} color="sun" />
            <Txt font="display" size="body">
              YOUR SQUAD
            </Txt>
            <Tag label={`${squadOvr} OVR`} fill="ink" textColor="white" style={styles.center} />
          </Sticker>
        </View>
        <View style={styles.right}>
          <StickerButton fill="coral" round="xl" raise="high" onPress={go('/play')} accessibilityLabel="Play" face={styles.playFace}>
            <Icon name="play" size={sizes.iconHuge} color="white" />
            <StickerText size="big" color="white">
              PLAY
            </StickerText>
          </StickerButton>
          <View style={styles.grid}>
            <Tile label="PACKS" sub={packCount > 0 ? `${packCount} to open` : 'Card shop'} icon="pack" fill="grape" count={packCount} tag={freePack ? 'FREE PACK!' : undefined} onPress={go('/packs')} />
            <Tile label="SHELF" sub={`${have} of ${ALL_IDS.length} players`} icon="cards" fill="mint" count={fresh.length} onPress={go('/shelf')} />
          </View>
          <View style={styles.grid}>
            <Tile label="SQUAD" sub="Pick your three" icon="swap" fill="orange" onPress={go('/squad')} />
            <Tile label="MISSIONS" sub={toClaim > 0 ? 'Prizes waiting!' : 'New every day'} icon="target" fill="sunDeep" count={toClaim} onPress={go('/missions')} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  left: {
    flex: 1.05,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stage: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  floor: {
    position: 'absolute',
    bottom: space.xs,
    width: '86%',
    height: space.huge,
    borderRadius: space.huge,
    backgroundColor: color.scrimSoft,
  },
  figures: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: space.md,
  },
  figure: {
    width: '36%',
  },
  figureLead: {
    height: '100%',
    zIndex: 2,
    marginHorizontal: '-7%',
  },
  figureSide: {
    height: '84%',
    zIndex: 1,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  squadPill: {
    marginTop: -space.md,
    marginBottom: space.xs,
  },
  squadPillFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  center: {
    alignSelf: 'center',
  },
  right: {
    flex: 1,
    gap: space.sm,
    justifyContent: 'center',
    paddingBottom: space.xs,
  },
  playFace: {
    minHeight: sizes.buttonLarge + space.md,
    gap: space.md,
  },
  grid: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tile: {
    flex: 1,
  },
  tileFace: {
    justifyContent: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: sizes.buttonLarge,
    gap: space.sm,
  },
  tileText: {
    flex: 1,
  },
  tileTag: {
    position: 'absolute',
    top: -space.sm,
    left: space.sm,
    transform: [{ rotate: '-4deg' }],
  },
});
