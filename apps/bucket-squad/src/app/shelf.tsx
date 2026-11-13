/** The Shelf: every player there is, team by team, with empty spots for the ones still to find. */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, PLAYERS, byValue, leagueTeams, teamPlayers } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import { countOwned, levelOf, type Owned } from '@/meta/collection';
import { useSave } from '@/state/save';
import { size as sizes, space } from '@/theme/tokens';
import { Tag, TeamBadge } from '@/ui/Bits';
import { Segmented } from '@/ui/Inputs';
import { PlayerCard } from '@/ui/PlayerCard';
import { Screen, useBodySize } from '@/ui/Screen';
import { Sticker } from '@/ui/Sticker';
import { Txt } from '@/ui/Txt';

const ALL_IDS = PLAYERS.map((p) => p.id);
const COLUMNS = 3;
const HEAD_H = sizes.badgeSmall + space.xs;

function TeamPage({ team, owned, fresh, cardW, onOpen }: { team: TeamDef; owned: Owned; fresh: readonly string[]; cardW: number; onOpen: (id: string) => void }) {
  const players = teamPlayers(team.id).sort(byValue);
  const have = countOwned(
    owned,
    players.map((p) => p.id),
  );
  return (
    <Sticker fill="paper" round="lg" raise="mid" face={styles.page}>
      <View style={styles.pageHead}>
        <TeamBadge team={team} diameter={sizes.badgeSmall} />
        <Txt font="display" size="body" lines={1} style={styles.pageName}>
          {team.name}
        </Txt>
        <Tag label={`${have} / ${players.length}`} fill={have === players.length ? 'mint' : 'paperDim'} style={styles.centerSelf} />
      </View>
      <View style={[styles.grid, { width: cardW * COLUMNS + space.sm * (COLUMNS - 1) }]}>
        {players.map((p) => {
          const copies = owned[p.id] ?? 0;
          return <PlayerCard key={p.id} player={p} level={levelOf(copies)} locked={copies === 0} fresh={fresh.includes(p.id)} width={cardW} onPress={() => onOpen(p.id)} />;
        })}
      </View>
    </Sticker>
  );
}

export default function Shelf() {
  const router = useRouter();
  const owned = useSave((s) => s.owned);
  const fresh = useSave((s) => s.fresh);
  const body = useBodySize();
  const [league, setLeague] = useState(LEAGUES[0].id);
  const teams = leagueTeams(league);

  // two rows of cards have to fit under the page's heading
  const rowH = (body.height - HEAD_H - space.sm * 4 - space.md) / 2;
  const cardW = Math.max(sizes.cardSmall - space.xl, Math.min(sizes.card + space.lg, Math.floor(rowH / sizes.cardRatio)));

  return (
    <Screen title="SHELF" tone="mint" right={<Tag label={`${countOwned(owned, ALL_IDS)} / ${ALL_IDS.length} players`} fill="paper" style={styles.centerSelf} />}>
      {LEAGUES.length > 1 && <Segmented options={LEAGUES.map((l) => ({ value: l.id, label: l.name }))} value={league} onChange={setLeague} style={styles.leagues} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {teams.map((t) => (
          <TeamPage key={t.id} team={t} owned={owned} fresh={fresh} cardW={cardW} onOpen={(id) => router.push({ pathname: '/player/[id]', params: { id } })} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: space.md,
    paddingRight: space.lg,
    alignItems: 'center',
  },
  leagues: {
    marginBottom: space.xs,
    maxWidth: sizes.panelMax,
  },
  page: {
    padding: space.sm,
    gap: space.xs,
  },
  pageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: HEAD_H,
  },
  pageName: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});
