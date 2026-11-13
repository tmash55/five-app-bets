/** Choose the three players you take to the court, and who leads them. */

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { PLAYERS, byValue, mustPlayer, playerOverall } from '@/data/roster';
import { levelOf } from '@/meta/collection';
import { chemistry } from '@/meta/match';
import { useSave } from '@/state/save';
import { color, px, radius, size as sizes, space, stroke } from '@/theme/tokens';
import { Tag } from '@/ui/Bits';
import { Icon, type IconName } from '@/ui/Icon';
import { PlayerCard } from '@/ui/PlayerCard';
import { columnsThatFit, rowsOf } from '@/ui/rows';
import { Screen, useBodySize } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

/** what the spot labels, tags and hint need around the three squad cards */
const AROUND_CARDS = px(104);
/** the dashed ring round a spot, both sides of its card */
const RING = (stroke.regular + space.hair) * 2;
const BENCH_CARD = sizes.cardSmall - space.sm;

const SPOTS: readonly { label: string; icon: IconName }[] = [
  { label: 'CAPTAIN', icon: 'crown' },
  { label: 'STARTER', icon: 'ball' },
  { label: '3 ON 3', icon: 'plus' },
];

export default function Squad() {
  const params = useLocalSearchParams<{ add?: string }>();
  const squad = useSave((s) => s.squad);
  const owned = useSave((s) => s.owned);
  const setSquad = useSave((s) => s.setSquad);
  const body = useBodySize();
  /** a player waiting for a spot */
  const [pick, setPick] = useState<string | null>(() => (typeof params.add === 'string' && (owned[params.add] ?? 0) > 0 && !squad.includes(params.add) ? params.add : null));
  /** a spot waiting for a player */
  const [spot, setSpot] = useState<number | null>(null);

  const mine = PLAYERS.filter((p) => (owned[p.id] ?? 0) > 0).sort(byValue);
  const level = (id: string) => Math.max(1, levelOf(owned[id] ?? 1));
  const ovr = squad.length > 0 ? Math.round(squad.reduce((a, id) => a + playerOverall(mustPlayer(id), level(id)), 0) / squad.length) : 0;
  const chem = chemistry(squad);

  const place = (index: number, id: string) => {
    const next = [...squad];
    const at = next.indexOf(id);
    // already in the squad: the two swap spots
    if (at >= 0) next[at] = next[index];
    next[index] = id;
    setSquad(next);
    setPick(null);
    setSpot(null);
    playSfx('lock');
  };

  const tapSpot = (i: number) => {
    if (pick !== null) place(i, pick);
    else if (spot !== null && spot !== i) place(i, squad[spot]);
    else setSpot(spot === i ? null : i);
  };

  const tapPlayer = (id: string) => {
    if (spot !== null) place(spot, id);
    else setPick(pick === id ? null : id);
  };

  const leftW = body.width * 0.46;
  const spotW = Math.max(sizes.cardSmall - space.md, Math.min(sizes.card, Math.floor((leftW - space.sm * 2 - RING * 3) / 3), Math.floor((body.height - AROUND_CARDS) / sizes.cardRatio)));
  const benchColumns = columnsThatFit(body.width - leftW - space.lg - space.xs * 2, BENCH_CARD, space.sm);
  const hint = pick !== null ? `Tap a spot for ${mustPlayer(pick).name}.` : spot !== null ? 'Now tap the player you want there.' : 'Tap a spot, then tap a player. Your squad wears the captain’s uniform.';

  return (
    <Screen title="SQUAD" tone="orange">
      <View style={styles.row}>
        <View style={[styles.left, { width: leftW }]}>
          <View style={styles.spots}>
            {squad.map((id, i) => (
              <View key={id} style={styles.spot}>
                <View style={styles.spotLabel}>
                  <Icon name={SPOTS[i].icon} size={sizes.iconTiny} color={i === 0 ? 'sun' : 'white'} />
                  <Txt font="display" size="small" color="white" shadow>
                    {SPOTS[i].label}
                  </Txt>
                </View>
                <View style={[styles.ring, (spot === i || pick !== null) && styles.ringOn]}>
                  <PlayerCard player={mustPlayer(id)} level={level(id)} width={spotW} selected={spot === i} onPress={() => tapSpot(i)} />
                </View>
              </View>
            ))}
          </View>
          <View style={styles.tags}>
            <Tag label={`${ovr} OVR`} fill="ink" textColor="white" />
            {chem > 0 ? <Tag label={`Teammates +${chem}`} fill="mint" icon="bolt" /> : <Tag label="Same team = bonus" fill="paper" icon="bolt" />}
          </View>
          <Txt font="display" size="body" color="white" shadow center style={styles.hint}>
            {hint}
          </Txt>
        </View>
        <ScrollView style={styles.bench} contentContainerStyle={styles.benchBody} showsVerticalScrollIndicator={false}>
          <View style={styles.benchRows}>
            {rowsOf(mine, benchColumns).map((row) => (
              <View key={row[0].id} style={styles.benchRow}>
                {row.map((p) => {
                  const at = squad.indexOf(p.id);
                  return (
                    <View key={p.id}>
                      <PlayerCard player={p} level={level(p.id)} width={BENCH_CARD} selected={pick === p.id} onPress={() => tapPlayer(p.id)} />
                      {at >= 0 && (
                        <View pointerEvents="none" style={styles.inSquad}>
                          <Icon name={SPOTS[at].icon} size={sizes.iconTiny} color={at === 0 ? 'sun' : 'white'} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  spots: {
    flexDirection: 'row',
    gap: space.sm,
  },
  spot: {
    alignItems: 'center',
    gap: space.hair,
  },
  spotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  ring: {
    borderRadius: radius.lg,
    borderWidth: stroke.regular,
    borderColor: color.clear,
    borderStyle: 'dashed',
    padding: space.hair,
  },
  ringOn: {
    borderColor: color.white,
  },
  tags: {
    flexDirection: 'row',
    gap: space.sm,
  },
  hint: {
    maxWidth: sizes.panelMax / 2 + space.huge,
  },
  bench: {
    flex: 1,
  },
  benchBody: {
    alignItems: 'center',
    paddingBottom: space.md,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
  },
  // the rows share a left edge, and the whole block sits in the middle
  benchRows: {
    gap: space.sm,
  },
  benchRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  // the spot's own icon on the corner the card leaves free, so the rating stays readable
  inSquad: {
    position: 'absolute',
    top: -space.xs,
    right: -space.xs,
    width: sizes.badgeTiny + space.xs,
    height: sizes.badgeTiny + space.xs,
    borderRadius: (sizes.badgeTiny + space.xs) / 2,
    backgroundColor: color.ink,
    borderWidth: stroke.thin,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
