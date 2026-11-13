/** Choose the three players you take to the court, and who leads them. */

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { PLAYERS, byValue, mustPlayer, playerOverall } from '@/data/roster';
import { levelOf } from '@/meta/collection';
import { chemistry } from '@/meta/match';
import { useSave } from '@/state/save';
import { arcade, halo, night, tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen, useArcadeBody } from '@/ui/arcade/ArcadeScreen';
import { ArcadeCard } from '@/ui/arcade/Card';
import { SignHead } from '@/ui/arcade/Controls';
import { LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { Spotlight, StageRing } from '@/ui/arcade/Room';
import { ChemChip, OvrMeter } from '@/ui/arcade/Strength';
import { NeonPanel } from '@/ui/arcade/Surface';
import { Print } from '@/ui/arcade/Type';
import { columnsThatFit, rowsOf } from '@/ui/rows';

/** the page's own tube, the one the home page's SQUAD sign is bent from */
const TUBE = tube.violet;
/** what the spot labels, the strength chips and the hint need round the three squad cards */
const AROUND_CARDS = px(124);
/** the lit socket round a spot: its gap and its line, both sides of the card */
const SOCKET_PAD = px(4);
const SOCKET = (SOCKET_PAD + arcade.outline) * 2;
/** the bench's cards: no smaller than this (so the rarity still shows), no bigger than that */
const BENCH_MIN = px(92);
const BENCH_MAX = px(120);
const BENCH_GAP = space.sm;
/** the bench panel's padding and line, both sides */
const PANEL_IN = (px(12) + arcade.outline) * 2;

const SPOTS: readonly { label: string; icon: LineIconName }[] = [
  { label: 'CAPTAIN', icon: 'crown' },
  { label: 'STARTER', icon: 'ball' },
  { label: '3 ON 3', icon: 'plus' },
];

export default function Squad() {
  const params = useLocalSearchParams<{ add?: string }>();
  const squad = useSave((s) => s.squad);
  const owned = useSave((s) => s.owned);
  const setSquad = useSave((s) => s.setSquad);
  const body = useArcadeBody();
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

  const height = body.height - space.md;
  const leftW = Math.floor(body.width * 0.46);
  const spotW = Math.max(BENCH_MIN - space.md, Math.min(px(150), Math.floor((leftW - space.md * 2) / 3 - SOCKET), Math.floor((height - AROUND_CARDS) / sizes.cardRatio - SOCKET)));
  const benchRoom = body.width - leftW - space.lg - PANEL_IN;
  const benchColumns = columnsThatFit(benchRoom, BENCH_MIN, BENCH_GAP);
  const benchW = Math.min(BENCH_MAX, Math.floor((benchRoom - BENCH_GAP * (benchColumns - 1)) / benchColumns));
  const hint = pick !== null ? `Tap a spot for ${mustPlayer(pick).name}.` : spot !== null ? 'Now tap the player you want there.' : 'Tap a spot, then tap a player. Your squad wears the captain’s uniform.';
  const stageW = (spotW + SOCKET) * 3 + space.md * 2;
  // the beam lands on the ring at the squad's feet: the column is centred, so find where the cards end in it
  const cardsTall = SPOT_LABEL + (spotW + SOCKET) * sizes.cardRatio;
  const beamTall = space.md + (height - (cardsTall + AROUND_CARDS - SPOT_LABEL)) / 2 + cardsTall - px(10);

  return (
    <ArcadeScreen title="SQUAD" tube="violet" style={styles.body}>
      <View style={styles.row}>
        <View style={[styles.left, { width: leftW }]}>
          {/* the squad stands under a spotlight, on a lit ring like the one on the home page */}
          <Spotlight width={stageW * 0.9} height={beamTall} style={styles.beam} />
          <View style={styles.spots}>
            <StageRing width={stageW + space.xxl} height={px(48)} tube="violet" style={styles.ring} />
            {squad.map((id, i) => {
              const target = pick !== null || (spot !== null && spot !== i);
              return (
                <Arrive key={id} delay={60 + i * 70} style={styles.spot}>
                  <View style={styles.spotLabel}>
                    <LineIcon name={SPOTS[i].icon} size={px(15)} tube={i === 0 ? 'gold' : TUBE} />
                    <Print face="display" size="small" color={i === 0 ? tube.gold.tint : TUBE.tint} track="normal" glow={i === 0 ? tube.gold.glass : TUBE.glass}>
                      {SPOTS[i].label}
                    </Print>
                  </View>
                  <View>
                    <Breathe on={target} depth={0.55} style={[styles.socket, target && styles.socketLit]} />
                    <View style={styles.socketIn}>
                      <ArcadeCard player={mustPlayer(id)} level={level(id)} width={spotW} selected={spot === i} onPress={() => tapSpot(i)} />
                    </View>
                  </View>
                </Arrive>
              );
            })}
          </View>
          <Arrive delay={300} from="up" style={[styles.chips, { maxWidth: leftW }]}>
            <OvrMeter value={ovr} tube="violet" />
            <ChemChip chemistry={chem} />
          </Arrive>
          <Print face="medium" size="body" color={pick !== null || spot !== null ? 'text' : 'textDim'} center lines={2} style={styles.hint}>
            {hint}
          </Print>
        </View>

        <Arrive delay={120} from="right" style={styles.right}>
          <NeonPanel tube="violet" style={styles.panel}>
            <SignHead
              title="YOUR PLAYERS"
              tube="violet"
              right={
                <Print face="bold" size="tiny" color="textFaint" track="wider">
                  {`${mine.length} IN YOUR COLLECTION`}
                </Print>
              }
            />
            <ScrollView style={styles.bench} contentContainerStyle={styles.benchBody} showsVerticalScrollIndicator={false}>
              <View style={styles.benchRows}>
                {rowsOf(mine, benchColumns).map((row) => (
                  <View key={row[0].id} style={styles.benchRow}>
                    {row.map((p) => {
                      const at = squad.indexOf(p.id);
                      const picked = pick === p.id;
                      return (
                        <View key={p.id}>
                          <ArcadeCard player={p} level={level(p.id)} width={benchW} selected={picked} flat={!picked} onPress={() => tapPlayer(p.id)} />
                          {at >= 0 && (
                            <View pointerEvents="none" style={styles.inSquad}>
                              <LineIcon name={SPOTS[at].icon} size={px(13)} tube={at === 0 ? 'gold' : TUBE} weight={2.4} />
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </NeonPanel>
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

/** the height of a spot's label over its card */
const SPOT_LABEL = px(22);

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  left: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  beam: {
    position: 'absolute',
    top: -space.md,
    alignSelf: 'center',
  },
  // the ring lies on the floor round the cards' feet
  ring: {
    position: 'absolute',
    bottom: -px(22),
    left: -space.lg,
  },
  spots: {
    flexDirection: 'row',
    gap: space.md,
  },
  spot: {
    alignItems: 'center',
    gap: px(3),
  },
  spotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(5),
    height: SPOT_LABEL - px(3),
  },
  // a lit outline round a spot that is waiting for a player; it breathes, the card in it does not
  socket: {
    ...StyleSheet.absoluteFill,
    borderRadius: arcade.rTile + SOCKET_PAD,
    borderWidth: arcade.outline,
    borderStyle: 'dashed',
    borderColor: night.clear,
  },
  socketLit: {
    borderColor: TUBE.glass,
    boxShadow: [halo(TUBE.glass, 10, 0.7)],
  },
  socketIn: {
    padding: SOCKET_PAD + arcade.outline,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  hint: {
    maxWidth: px(330),
    minHeight: px(38),
  },
  right: {
    flex: 1,
  },
  panel: {
    flex: 1,
    paddingTop: px(10),
    paddingHorizontal: px(12),
    gap: space.sm,
    overflow: 'hidden',
  },
  bench: {
    flex: 1,
  },
  benchBody: {
    alignItems: 'center',
    paddingTop: px(6),
    paddingBottom: space.md,
  },
  // the rows share a left edge, and the whole block sits in the middle
  benchRows: {
    gap: BENCH_GAP,
  },
  benchRow: {
    flexDirection: 'row',
    gap: BENCH_GAP,
  },
  // the spot's own picture on the corner the card leaves free, so the rating stays readable
  inSquad: {
    position: 'absolute',
    top: -px(6),
    right: -px(6),
    width: px(24),
    height: px(24),
    borderRadius: px(12),
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: TUBE.glass,
    boxShadow: [halo(TUBE.glass, 8, 0.8)],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
