/** Set up a quick game: how many a side, how tough, who you play and where. */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, leagueOf } from '@/data/roster';
import { COURT_IDS, type CourtId } from '@/game/render/court';
import { DIFFICULTY_NAMES, playableTeams } from '@/meta/setups';
import { startQuick } from '@/state/play';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { PickRow, SignHead, Tabs, type Choice } from '@/ui/arcade/Controls';
import { FadeScroll } from '@/ui/arcade/FadeScroll';
import { Arrive } from '@/ui/arcade/Motion';
import { CourtPick, FADE_DOWN, FADE_UP, GLOW_ROOM, GRID_TOP, PANEL_PAD, TEAMS_FRAME, TEAM_GAP, teamGrid } from '@/ui/arcade/Pickers';
import { NeonPanel } from '@/ui/arcade/Surface';
import { TeamPick } from '@/ui/arcade/TeamPick';
import { Print } from '@/ui/arcade/Type';

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2', lamps: 2 },
  { value: 3, label: '3 on 3', lamps: 3 },
];
// one lamp for the easiest level, three for the hardest, for anyone who cannot read the word yet
const LEVELS: readonly Choice<0 | 1 | 2>[] = DIFFICULTY_NAMES.map((label, i) => ({ value: i as 0 | 1 | 2, label, lamps: i + 1 }));
const LEAGUE_TABS = LEAGUES.map((l) => ({ value: l.id, label: l.name }));

/** the label column beside each choice, so the three rows line up */
const LABEL_W = px(66);

function Option({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.option}>
      <Print face="bold" size="tiny" color="textFaint" track="wider" style={styles.optionLabel}>
        {label}
      </Print>
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

export default function Quick() {
  const router = useRouter();
  const format = useSave((s) => s.settings.format);
  const difficulty = useSave((s) => s.settings.difficulty);
  const setSetting = useSave((s) => s.setSetting);
  const homeTeam = useSave((s) => s.homeTeam);
  const last = useSession((s) => s.quick);
  const [opponent, setOpponent] = useState<string | null>(last?.opponent ?? null);
  const [court, setCourt] = useState<CourtId | null>(last?.court ?? null);
  const [league, setLeague] = useState(() => (opponent !== null ? leagueOf(opponent) : (last?.league ?? leagueOf(homeTeam))));
  const teams = playableTeams(format).filter((t) => t.league === league);
  const picked = opponent !== null && teams.some((t) => t.id === opponent) ? opponent : null;
  const [gridW, setGridW] = useState(0);
  // the height of the column the panel stands in, and of the panel's heading
  const [columnH, setColumnH] = useState(0);
  const [headH, setHeadH] = useState(0);

  const tiles = teams.length + 1;
  const room = columnH - TEAMS_FRAME - headH - GRID_TOP - GLOW_ROOM;
  const grid = gridW > 0 && columnH > 0 && headH > 0 ? teamGrid(tiles, gridW, room) : null;
  // the fade covers the half row: its coloured stripe still shows, and it is solid before the team's
  // letters begin (about a fifth of the way down a tile), so the edge never cuts through lettering
  const fadeH = grid?.window !== undefined ? Math.round(grid.tileH * 0.5 + TEAM_GAP) : 0;
  const fadeAt = fadeH > 0 && grid ? ([0, (TEAM_GAP + grid.tileH * 0.1) / fadeH, (TEAM_GAP + grid.tileH * 0.21) / fadeH] as const) : undefined;

  const play = () => {
    startQuick({ perTeam: format, difficulty, opponent: picked, court, league });
    router.push('/versus');
  };

  return (
    <ArcadeScreen title="QUICK GAME" tube="cyan" style={styles.body} right={LEAGUES.length > 1 ? <Tabs options={LEAGUE_TABS} value={league} onChange={setLeague} tube="cyan" /> : undefined}>
      <View style={styles.row}>
        <Arrive delay={40} from="left" style={styles.left}>
          <NeonPanel tube="cyan" style={styles.panel}>
            <Option label="PLAYERS">
              <PickRow options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} tube="cyan" />
            </Option>
            <Option label="LEVEL">
              <PickRow options={LEVELS} value={difficulty} onChange={(v) => setSetting('difficulty', v)} tube="cyan" />
            </Option>
            <Option label="COURT">
              {/* the courts that do not fit melt into the panel at its edge; the row's glow room is pulled back out so it starts in line with the rows above */}
              <FadeScroll horizontal showsHorizontalScrollIndicator={false} reach={px(30)} style={styles.courtsBox} contentContainerStyle={styles.courts}>
                <CourtPick id={null} selected={court === null} onPress={() => setCourt(null)} />
                {COURT_IDS.map((id) => (
                  <CourtPick key={id} id={id} selected={court === id} onPress={() => setCourt(id)} />
                ))}
              </FadeScroll>
            </Option>
          </NeonPanel>
          <GoldButton label="PLAY!" icon="play" onPress={play} />
        </Arrive>

        <Arrive delay={110} from="right" style={styles.grow}>
          <View
            style={styles.right}
            onLayout={(e) => {
              const h = Math.floor(e.nativeEvent.layout.height);
              if (h !== columnH) setColumnH(h);
            }}>
            <NeonPanel tube="cyan" style={styles.teamsPanel}>
              <View
                onLayout={(e) => {
                  const h = Math.ceil(e.nativeEvent.layout.height);
                  if (h !== headH) setHeadH(h);
                }}>
                <SignHead title="WHO DO YOU WANT TO PLAY?" tube="cyan" room={gridW > 0 ? gridW : undefined} style={styles.teamsHead} />
              </View>
              <ScrollView
                key={league}
                style={[styles.teamsScroll, grid?.window !== undefined && { height: grid.window, flexShrink: 0 }]}
                contentContainerStyle={[styles.teams, { paddingBottom: grid?.window !== undefined ? fadeH : GLOW_ROOM }]}
                showsVerticalScrollIndicator={false}
                onLayout={(e) => {
                  // a point spare: the browser can round the measured width up by half a point, and a row that is a hair too wide wraps a whole tile onto the next line
                  const w = Math.floor(e.nativeEvent.layout.width - GLOW_ROOM * 2 - px(1));
                  if (w !== gridW) setGridW(w);
                }}>
                {grid && (
                  <>
                    <TeamPick label="Surprise me" selected={picked === null} onPress={() => setOpponent(null)} width={grid.tileW} height={grid.tileH} />
                    {teams.map((t) => (
                      <TeamPick key={t.id} team={t} selected={t.id === picked} onPress={() => setOpponent(t.id)} width={grid.tileW} height={grid.tileH} />
                    ))}
                  </>
                )}
              </ScrollView>
              {/* more teams below: the half row showing fades into the panel instead of stopping at a hard edge */}
              {fadeH > 0 && <LinearGradient pointerEvents="none" colors={FADE_DOWN} locations={fadeAt} style={[styles.teamsFade, { height: fadeH }]} />}
              {/* and the rows scrolled away go softly under the heading */}
              {fadeH > 0 && <LinearGradient pointerEvents="none" colors={FADE_UP} style={[styles.teamsFadeTop, { top: px(10) + headH, height: GRID_TOP }]} />}
            </NeonPanel>
          </View>
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
    gap: space.lg,
  },
  grow: {
    flex: 1,
  },
  left: {
    width: '46%',
    justifyContent: 'center',
    gap: space.md,
  },
  panel: {
    padding: PANEL_PAD,
    gap: space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  optionLabel: {
    width: LABEL_W,
  },
  // out to the panel's tube on the right, so the courts melt away right up to it rather than stopping short
  courtsBox: {
    marginLeft: -GLOW_ROOM,
    marginRight: -PANEL_PAD,
  },
  courts: {
    gap: space.sm,
    padding: GLOW_ROOM,
  },
  // on a tall screen the panel is only as tall as its teams, in the middle beside the options
  right: {
    flex: 1,
    justifyContent: 'center',
  },
  teamsPanel: {
    flexShrink: 1,
    paddingTop: px(10),
    paddingHorizontal: px(10) - GLOW_ROOM,
    overflow: 'hidden',
  },
  teamsScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  teamsHead: {
    paddingHorizontal: GLOW_ROOM,
  },
  teams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TEAM_GAP,
    paddingHorizontal: GLOW_ROOM,
    paddingTop: GRID_TOP,
  },
  teamsFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  teamsFadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
