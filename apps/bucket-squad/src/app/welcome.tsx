/** First launch: pick a home team and meet the three kids you start with. */

import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { mustPlayer, teamById } from '@/data/roster';
import { playSfx } from '@/audio/sound';
import { homeTeamChoices, starterIds } from '@/state/logic';
import { useSave } from '@/state/save';
import { size as sizes, space } from '@/theme/tokens';
import { TeamBadge } from '@/ui/Bits';
import { PlayerCard } from '@/ui/PlayerCard';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { TeamTile } from '@/ui/TeamTile';
import { StickerText, Txt } from '@/ui/Txt';

export default function Welcome() {
  const router = useRouter();
  const onboarded = useSave((s) => s.onboarded);
  const startCareer = useSave((s) => s.startCareer);
  const [teams] = useState(homeTeamChoices);
  const [teamId, setTeamId] = useState(teams[0].id);
  const [leaving, setLeaving] = useState(false);
  const team = teamById(teamId);
  const starters = useMemo(() => starterIds(teamId).map(mustPlayer), [teamId]);

  if (onboarded && !leaving) return <Redirect href="/" />;

  const choose = () => {
    setLeaving(true);
    playSfx('star');
    startCareer(teamId);
    // straight into the free starter pack
    router.replace({ pathname: '/open', params: { pack: 'playground', first: '1' } });
  };

  return (
    <Screen
      back={false}
      coins={false}
      left={
        <StickerText size="title" color="sun">
          PICK YOUR HOME TEAM
        </StickerText>
      }>
      <View style={styles.row}>
        <ScrollView style={styles.teams} contentContainerStyle={styles.teamsBody} showsVerticalScrollIndicator={false}>
          {teams.map((t) => (
            <TeamTile key={t.id} team={t} selected={t.id === teamId} onPress={() => setTeamId(t.id)} />
          ))}
        </ScrollView>
        <Sticker fill="paper" round="xl" raise="high" style={styles.preview} face={styles.previewFace}>
          <View style={styles.head}>
            <TeamBadge team={team} diameter={sizes.badgeLarge} />
            <View style={styles.headText}>
              <Txt font="display" size="title" lines={1} fit>
                {team.name}
              </Txt>
              <Txt size="small" color="inkSoft" lines={2}>
                {team.motto ?? team.place}
              </Txt>
            </View>
          </View>
          <View style={styles.cards}>
            {starters.map((p) => (
              <PlayerCard key={p.id} player={p} width={sizes.cardSmall} />
            ))}
          </View>
          <StickerButton label="THIS IS MY TEAM!" fill="mint" height={sizes.button} onPress={choose} quiet />
        </Sticker>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'center',
  },
  teams: {
    flex: 1,
    alignSelf: 'stretch',
  },
  teamsBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    alignContent: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingVertical: space.xs,
  },
  preview: {
    width: sizes.cardSmall * 3 + space.sm * 2 + space.lg * 2 + space.sm,
  },
  previewFace: {
    padding: space.md,
    gap: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  headText: {
    flex: 1,
  },
  cards: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
});
