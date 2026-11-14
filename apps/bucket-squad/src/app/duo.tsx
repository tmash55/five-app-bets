/**
 * Set up a two-player game on one screen. P1 plays the squad on this device; P2 picks a team (its strongest side)
 * or a fair match. Then how many a side, the court, and whether someone gets a helping hand.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, leagueOf } from '@/data/roster';
import { COURT_IDS, type CourtId } from '@/game/render/court';
import { homeSide, playableTeams, sideOverall, type DuoOptions } from '@/meta/setups';
import { startDuo } from '@/state/play';
import { squadLevels } from '@/state/logic';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { tube as tubes } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { PickRow, SignHead, Tabs, type Choice } from '@/ui/arcade/Controls';
import { FadeScroll } from '@/ui/arcade/FadeScroll';
import { Arrive } from '@/ui/arcade/Motion';
import { CourtPick, FADE_DOWN, FADE_UP, GLOW_ROOM, GRID_TOP, PANEL_PAD, TEAMS_FRAME, TEAM_GAP, teamGrid } from '@/ui/arcade/Pickers';
import { OvrMeter } from '@/ui/arcade/Strength';
import { NeonPanel } from '@/ui/arcade/Surface';
import { TeamPick } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2', lamps: 2 },
  { value: 3, label: '3 on 3', lamps: 3 },
];
/** a helping hand: a wider shot window, and help while behind */
const HELP: readonly Choice<0 | 1 | 2>[] = [
  { value: 0, label: 'Nobody' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
];
const LEAGUE_TABS = LEAGUES.map((l) => ({ value: l.id, label: l.name }));

/** the label column beside each choice, so the rows line up */
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

export default function Duo() {
  const router = useRouter();
  const format = useSave((s) => s.settings.format);
  const setSetting = useSave((s) => s.setSetting);
  const homeTeam = useSave((s) => s.homeTeam);
  const last = useSession((s) => s.duo);
  const [rival, setRival] = useState<string | null>(last?.rival ?? null);
  const [court, setCourt] = useState<CourtId | null>(last?.court ?? null);
  const [help, setHelp] = useState<DuoOptions['help']>(last?.help ?? 0);
  const [league, setLeague] = useState(() => (rival !== null ? leagueOf(rival) : leagueOf(homeTeam)));
  const teams = playableTeams(format).filter((t) => t.league === league);
  const picked = rival !== null && teams.some((t) => t.id === rival) ? rival : null;
  // P1's squad as it takes the court, for the fair match and the meter
  const mine = useSave((s) => sideOverall(homeSide(squadLevels(s)), format));
  const [gridW, setGridW] = useState(0);
  const [columnH, setColumnH] = useState(0);
  const [headH, setHeadH] = useState(0);

  const tiles = teams.length + 1;
  const room = columnH - TEAMS_FRAME - headH - GRID_TOP - GLOW_ROOM;
  const grid = gridW > 0 && columnH > 0 && headH > 0 ? teamGrid(tiles, gridW, room) : null;
  const fadeH = grid?.window !== undefined ? Math.round(grid.tileH * 0.5 + TEAM_GAP) : 0;
  const fadeAt = fadeH > 0 && grid ? ([0, (TEAM_GAP + grid.tileH * 0.1) / fadeH, (TEAM_GAP + grid.tileH * 0.21) / fadeH] as const) : undefined;

  const play = () => {
    startDuo({ perTeam: format, rival: picked, court, help });
    router.push('/versus');
  };

  return (
    <ArcadeScreen title="2 PLAYERS" tube="pink" style={styles.body} right={LEAGUES.length > 1 ? <Tabs options={LEAGUE_TABS} value={league} onChange={setLeague} tube="pink" /> : undefined}>
      <View style={styles.row}>
        <Arrive delay={40} from="left" style={styles.left}>
          <NeonPanel tube="pink" style={styles.panel}>
            {/* P1 needs no choosing: the squad on this device */}
            <View style={styles.p1}>
              <Glow face="display" size="title" tube="cyan" track="close">
                P1
              </Glow>
              <View style={styles.grow}>
                <Print face="bold" size="body" color="text" lines={1}>
                  Your Squad
                </Print>
                <Print face="medium" size="tiny" color="textDim" lines={1}>
                  plays on the left
                </Print>
              </View>
              <OvrMeter value={mine} tube="cyan" />
            </View>
            <Option label="PLAYERS">
              <PickRow options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} tube="pink" />
            </Option>
            <Option label="HELP">
              <PickRow options={HELP} value={help} onChange={setHelp} tube="pink" />
            </Option>
            <Option label="COURT">
              <FadeScroll horizontal showsHorizontalScrollIndicator={false} reach={px(30)} style={styles.courtsBox} contentContainerStyle={styles.courts}>
                <CourtPick id={null} selected={court === null} onPress={() => setCourt(null)} tube="pink" />
                {COURT_IDS.map((id) => (
                  <CourtPick key={id} id={id} selected={court === id} onPress={() => setCourt(id)} tube="pink" />
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
            <NeonPanel tube="pink" style={styles.teamsPanel}>
              <View
                onLayout={(e) => {
                  const h = Math.ceil(e.nativeEvent.layout.height);
                  if (h !== headH) setHeadH(h);
                }}>
                <SignHead title="P2, PICK YOUR TEAM" tube="pink" room={gridW > 0 ? gridW : undefined} style={styles.teamsHead} />
              </View>
              <ScrollView
                key={league}
                style={[styles.teamsScroll, grid?.window !== undefined && { height: grid.window, flexShrink: 0 }]}
                contentContainerStyle={[styles.teams, { paddingBottom: grid?.window !== undefined ? fadeH : GLOW_ROOM }]}
                showsVerticalScrollIndicator={false}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width - GLOW_ROOM * 2 - px(1));
                  if (w !== gridW) setGridW(w);
                }}>
                {grid && (
                  <>
                    <TeamPick label="Fair match" icon="target" selected={picked === null} onPress={() => setRival(null)} width={grid.tileW} height={grid.tileH} />
                    {teams.map((t) => (
                      <TeamPick key={t.id} team={t} selected={t.id === picked} onPress={() => setRival(t.id)} width={grid.tileW} height={grid.tileH} />
                    ))}
                  </>
                )}
              </ScrollView>
              {fadeH > 0 && <LinearGradient pointerEvents="none" colors={FADE_DOWN} locations={fadeAt} style={[styles.teamsFade, { height: fadeH }]} />}
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
  p1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tubes.cyan.glass,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  optionLabel: {
    width: LABEL_W,
  },
  courtsBox: {
    marginLeft: -GLOW_ROOM,
    marginRight: -PANEL_PAD,
  },
  courts: {
    gap: space.sm,
    padding: GLOW_ROOM,
  },
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
