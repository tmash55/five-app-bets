/** One player up close: the big card, the six ratings, the level bar and where to find them. */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { boosted, levelBonus, playerById, teamById } from '@/data/roster';
import type { PlayerDef } from '@/data/types';
import { RATING_KEYS, RATING_LABELS } from '@/game/sim/ratings';
import { levelProgress } from '@/meta/collection';
import { TOURS } from '@/meta/tour';
import { useSave } from '@/state/save';
import { size as sizes, space } from '@/theme/tokens';
import { ProgressBar, RARITY_COLOR, RarityTag, Tag, TeamBadge } from '@/ui/Bits';
import { PlayerCard } from '@/ui/PlayerCard';
import { Screen, useBodySize } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { Txt } from '@/ui/Txt';

/** The tour stop where this player is the prize, if there is one. */
function tourStop(id: string): string | null {
  for (const tour of TOURS) {
    for (const stage of tour.stages) {
      if (stage.games.some((g) => g.unlock === id)) return stage.team.name;
    }
  }
  return null;
}

function Detail({ player }: { player: PlayerDef }) {
  const router = useRouter();
  const body = useBodySize();
  const copies = useSave((s) => s.owned[player.id] ?? 0);
  const inSquad = useSave((s) => s.squad.includes(player.id));
  const markSeen = useSave((s) => s.markSeen);
  const team = teamById(player.team);
  const prog = levelProgress(copies);
  const have = copies > 0;
  const rc = RARITY_COLOR[player.rarity];
  const ratings = boosted(player.ratings, levelBonus(Math.max(1, prog.level)));
  const stop = tourStop(player.id);
  const cardW = Math.max(sizes.card, Math.min(sizes.cardLarge + space.lg, Math.floor((body.height - space.lg) / sizes.cardRatio)));

  useEffect(() => {
    markSeen(player.id);
  }, [markSeen, player.id]);

  return (
    <Screen title={have ? player.name.toUpperCase() : 'NOT FOUND YET'} tone="mint">
      <View style={styles.row}>
        <PlayerCard player={player} level={prog.level} locked={!have} width={cardW} shine={have && (player.rarity === 'legend' || player.rarity === 'epic')} />
        <Sticker fill="paper" round="lg" raise="mid" style={styles.panelBox} face={styles.panel}>
          <View style={styles.line}>
            <TeamBadge team={team} diameter={sizes.badgeSmall} />
            <Txt font="display" size="body" lines={1} style={styles.grow}>
              {`${team.name}  ·  ${player.role}`}
            </Txt>
            <RarityTag rarity={player.rarity} style={styles.centerSelf} />
            {player.era === 'classic' && <Tag label="Old school" fill="paperDim" style={styles.centerSelf} />}
          </View>
          {have ? (
            <>
              <Txt size="small" color="inkSoft" lines={2}>
                {player.nickname ? `"${player.nickname}". ${player.blurb}` : player.blurb}
              </Txt>
              <View style={styles.ratings}>
                {RATING_KEYS.map((k) => (
                  <View key={k} style={styles.rating}>
                    <Txt size="small" lines={1} style={styles.ratingLabel}>
                      {RATING_LABELS[k]}
                    </Txt>
                    <ProgressBar value={(ratings[k] - 30) / 69} fill={rc.fill} style={styles.grow} />
                    <Txt font="display" size="body" style={styles.ratingValue}>
                      {String(ratings[k])}
                    </Txt>
                  </View>
                ))}
              </View>
              <View style={styles.line}>
                <Tag label={`Level ${prog.level}`} fill={rc.deep} textColor="white" style={styles.centerSelf} />
                {prog.maxed ? (
                  <Txt size="small" color="inkSoft" style={styles.grow}>
                    Top level! Extra copies turn into coins.
                  </Txt>
                ) : (
                  <>
                    <ProgressBar value={prog.have / prog.need} fill={rc.fill} style={styles.grow} />
                    <Txt size="small" color="inkSoft">{`${prog.need - prog.have} more ${prog.need - prog.have === 1 ? 'copy' : 'copies'} to level up`}</Txt>
                  </>
                )}
              </View>
              {inSquad ? (
                <StickerButton label="IN YOUR SQUAD" icon="check" iconColor="mint" fill="white" textSize="body" onPress={() => router.push('/squad')} />
              ) : (
                <StickerButton label="PUT IN MY SQUAD" icon="swap" iconColor="white" fill="orange" textSize="body" onPress={() => router.push({ pathname: '/squad', params: { add: player.id } })} />
              )}
            </>
          ) : (
            <>
              <Txt color="inkSoft">{`A mystery ${player.role} from the ${team.place} ${team.name}. Their ratings show up once you find them.`}</Txt>
              <View style={styles.hints}>
                <Tag label="Find them in packs" fill="grape" textColor="white" icon="pack" />
                {stop !== null && <Tag label={`Or win the ${stop} Showdown on the Tour`} fill="mint" icon="flag" />}
              </View>
              <StickerButton label="GO TO PACKS" icon="pack" iconColor="white" fill="grape" textColor="white" textSize="body" onPress={() => router.push('/packs')} />
            </>
          )}
        </Sticker>
      </View>
    </Screen>
  );
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = typeof id === 'string' ? playerById(id) : undefined;
  if (!player) return <Redirect href="/shelf" />;
  return <Detail key={player.id} player={player} />;
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },
  panelBox: {
    flex: 1,
    maxWidth: sizes.panelMax,
  },
  panel: {
    padding: space.md,
    gap: space.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.lg,
    rowGap: space.xs,
  },
  rating: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  ratingLabel: {
    width: sizes.buttonLarge,
  },
  ratingValue: {
    width: space.xl,
    textAlign: 'right',
  },
  hints: {
    gap: space.xs,
  },
});
