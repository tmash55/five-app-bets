/** First launch: pick a home team and meet the three kids you start with. */

import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { LEAGUES, mustPlayer, teamById } from '@/data/roster';
import { homeTeamChoices, starterIds } from '@/state/logic';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { ArcadeCard } from '@/ui/arcade/Card';
import { Tabs } from '@/ui/arcade/Controls';
import { Arrive } from '@/ui/arcade/Motion';
import { Bloom } from '@/ui/arcade/Room';
import { NeonPanel } from '@/ui/arcade/Surface';
import { TeamPick, TEAM_PICK_WIDTH, teamTube } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';

const CARD_W = sizes.cardSmall;
const CARD_GAP = space.sm;
const PAD = px(12);
const PREVIEW_W = CARD_W * 3 + CARD_GAP * 2 + PAD * 2 + arcade.outline * 2;
const CREST = px(54);
const TEAM_GAP = space.sm;
/** room round the lit tile inside the scrolling grid, so its glow is not cut off at the edge */
const GLOW_ROOM = px(8);
/** wider than this a tile is mostly empty */
const TILE_MAX = px(132);

export default function Welcome() {
  const router = useRouter();
  const onboarded = useSave((s) => s.onboarded);
  const startCareer = useSave((s) => s.startCareer);
  const [teams] = useState(homeTeamChoices);
  // a build with an extra league lets you pick a home team from either
  const leagues = LEAGUES.filter((l) => teams.some((t) => t.league === l.id)).map((l) => ({ value: l.id, label: l.name }));
  const [teamId, setTeamId] = useState(teams[0].id);
  const [leaving, setLeaving] = useState(false);
  const [gridW, setGridW] = useState(0);
  const team = teamById(teamId);
  const tb = teamTube(team);
  const shown = teams.filter((t) => t.league === team.league);
  const starters = useMemo(() => starterIds(teamId).map(mustPlayer), [teamId]);

  if (onboarded && !leaving) return <Redirect href="/" />;

  const choose = () => {
    setLeaving(true);
    playSfx('star');
    startCareer(teamId);
    // straight into the free starter pack
    router.replace({ pathname: '/open', params: { pack: 'playground', first: '1' } });
  };

  // as many tiles a row as fit, then evened out so no row is left half empty (six teams: two rows of three)
  const most = gridW > 0 ? Math.max(1, Math.floor((gridW + TEAM_GAP) / (TEAM_PICK_WIDTH + TEAM_GAP))) : 0;
  const cols = most > 0 ? Math.ceil(shown.length / Math.ceil(shown.length / most)) : 0;
  const tileW = cols > 0 ? Math.min(TILE_MAX, Math.floor((gridW - TEAM_GAP * (cols - 1)) / cols)) : TEAM_PICK_WIDTH;

  return (
    <ArcadeScreen
      title="PICK YOUR HOME TEAM"
      tube={tb}
      back={false}
      coins={false}
      style={styles.body}
      right={leagues.length > 1 ? <Tabs options={leagues} value={team.league} onChange={(league) => setTeamId((teams.find((t) => t.league === league) ?? teams[0]).id)} tube={tb} /> : undefined}>
      <View style={styles.row}>
        <ScrollView
          key={team.league}
          style={styles.teams}
          contentContainerStyle={styles.teamsBody}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => {
            const w = Math.floor(e.nativeEvent.layout.width - GLOW_ROOM * 2);
            if (w !== gridW) setGridW(w);
          }}>
          {cols > 0 && shown.map((t, i) => (
            <Arrive key={t.id} delay={30 + i * 35}>
              <TeamPick team={t} selected={t.id === teamId} onPress={() => setTeamId(t.id)} width={tileW} />
            </Arrive>
          ))}
        </ScrollView>

        <Arrive delay={120} from="right">
          <NeonPanel tube={tb} lit style={styles.preview}>
            <View style={styles.head}>
              <View>
                <Bloom size={CREST * 2.4} color={tb.glass} alpha={0.45} style={styles.bloom} />
                <View style={[styles.crest, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 12, 0.8), inner(tb.glass, 12, 0.35)] }]}>
                  <Print face="display" size="large" color={tb.tint} glow={tb.glass} room={CREST - px(10)} least={0.6}>
                    {team.short}
                  </Print>
                </View>
              </View>
              <View style={styles.headText}>
                <Print face="bold" size="tiny" color="textFaint" track="wider" lines={1}>
                  {team.place.toUpperCase()}
                </Print>
                <Glow face="display" size="title" tube={tb} track="close" room={PREVIEW_W - PAD * 2 - CREST - space.md}>
                  {team.name.toUpperCase()}
                </Glow>
                {team.motto !== undefined && (
                  <Print face="medium" size="small" color="textDim" lines={2}>
                    {team.motto}
                  </Print>
                )}
              </View>
            </View>
            <View style={styles.cards}>
              {starters.map((p, i) => (
                // a new team's kids pop in one after the other
                <Arrive key={`${teamId}-${p.id}`} delay={i * 70}>
                  <ArcadeCard player={p} width={CARD_W} />
                </Arrive>
              ))}
            </View>
            <GoldButton label="THIS IS MY TEAM!" icon="check" onPress={choose} quiet />
          </NeonPanel>
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
  },
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
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TEAM_GAP,
    alignContent: 'center',
    justifyContent: 'center',
    padding: GLOW_ROOM,
  },
  preview: {
    width: PREVIEW_W,
    padding: PAD,
    gap: space.sm,
    backgroundColor: night.panel,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  bloom: {
    position: 'absolute',
    left: (CREST - CREST * 2.4) / 2,
    top: (CREST - CREST * 2.4) / 2,
  },
  crest: {
    width: CREST,
    height: CREST,
    borderRadius: CREST / 2,
    borderWidth: arcade.outline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
  },
  headText: {
    flex: 1,
  },
  cards: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: CARD_GAP,
  },
});
