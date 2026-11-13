/** Set up a quick game: how many a side, how tough, who you play and where. */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { COURTS, COURT_IDS, type CourtId } from '@/game/render/court';
import { DIFFICULTY_NAMES, playableTeams } from '@/meta/setups';
import { startQuick } from '@/state/play';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { size as sizes, space } from '@/theme/tokens';
import { Segmented, type Choice } from '@/ui/Inputs';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { TeamTile } from '@/ui/TeamTile';
import { Txt } from '@/ui/Txt';

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2' },
  { value: 3, label: '3 on 3' },
];
const LEVELS: readonly Choice<0 | 1 | 2>[] = DIFFICULTY_NAMES.map((label, i) => ({ value: i as 0 | 1 | 2, label }));

export default function Quick() {
  const router = useRouter();
  const format = useSave((s) => s.settings.format);
  const difficulty = useSave((s) => s.settings.difficulty);
  const setSetting = useSave((s) => s.setSetting);
  const last = useSession((s) => s.quick);
  const [opponent, setOpponent] = useState<string | null>(last?.opponent ?? null);
  const [court, setCourt] = useState<CourtId | null>(last?.court ?? null);
  const teams = playableTeams(format);
  const picked = opponent !== null && teams.some((t) => t.id === opponent) ? opponent : null;

  const play = () => {
    startQuick({ perTeam: format, difficulty, opponent: picked, court });
    router.push('/versus');
  };

  return (
    <Screen title="QUICK GAME" tone="coral">
      <View style={styles.row}>
        <View style={styles.left}>
          <Sticker fill="paper" round="lg" raise="mid" face={styles.panel}>
            <View style={styles.option}>
              <Txt font="display" size="small" color="inkSoft">
                PLAYERS
              </Txt>
              <Segmented options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} />
            </View>
            <View style={styles.option}>
              <Txt font="display" size="small" color="inkSoft">
                LEVEL
              </Txt>
              <Segmented options={LEVELS} value={difficulty} onChange={(v) => setSetting('difficulty', v)} fill="mint" />
            </View>
            <View style={styles.option}>
              <Txt font="display" size="small" color="inkSoft">
                COURT
              </Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courts}>
                <StickerButton label="Their court" fill={court === null ? 'skyLight' : 'paperDim'} textColor={court === null ? 'ink' : 'inkFaint'} textSize="body" raise={court === null ? 'low' : 'none'} round="md" height={sizes.buttonSmall} onPress={() => setCourt(null)} />
                {COURT_IDS.map((id) => (
                  <StickerButton
                    key={id}
                    label={COURTS[id].name}
                    fill={court === id ? 'skyLight' : 'paperDim'}
                    textColor={court === id ? 'ink' : 'inkFaint'}
                    textSize="body"
                    raise={court === id ? 'low' : 'none'}
                    round="md"
                    height={sizes.buttonSmall}
                    onPress={() => setCourt(id)}
                    accessibilityLabel={`${COURTS[id].name}${court === id ? ', selected' : ''}`}
                  />
                ))}
              </ScrollView>
            </View>
          </Sticker>
          <StickerButton label="PLAY!" icon="play" iconColor="white" fill="mint" textSize="title" raise="high" height={sizes.buttonLarge} onPress={play} />
        </View>
        <View style={styles.right}>
          <Txt font="display" size="body" color="white" shadow center>
            WHO DO YOU WANT TO PLAY?
          </Txt>
          <ScrollView style={styles.teams} contentContainerStyle={styles.teamsBody} showsVerticalScrollIndicator={false}>
            <TeamTile label="Surprise me" selected={picked === null} onPress={() => setOpponent(null)} />
            {teams.map((t) => (
              <TeamTile key={t.id} team={t} selected={t.id === picked} onPress={() => setOpponent(t.id)} />
            ))}
          </ScrollView>
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
    width: '44%',
    gap: space.sm,
    justifyContent: 'center',
  },
  panel: {
    padding: space.md,
    gap: space.sm,
  },
  option: {
    gap: space.hair,
  },
  courts: {
    gap: space.sm,
    alignItems: 'flex-end',
    paddingRight: space.sm,
  },
  right: {
    flex: 1,
    gap: space.xs,
  },
  teams: {
    flex: 1,
  },
  teamsBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
    paddingBottom: space.sm,
    paddingTop: space.xs,
  },
});
