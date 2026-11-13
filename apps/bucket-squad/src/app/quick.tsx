/** Set up a quick game: how many a side, how tough, who you play and where. */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, leagueOf } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { COURTS, COURT_IDS, type CourtId } from '@/game/render/court';
import { DIFFICULTY_NAMES, playableTeams } from '@/meta/setups';
import { startQuick } from '@/state/play';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { arcade, halo, inner, night, tube as tubes } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { PickRow, SignHead, Tabs, type Choice } from '@/ui/arcade/Controls';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Arrive } from '@/ui/arcade/Motion';
import { NeonPanel } from '@/ui/arcade/Surface';
import { TeamPick, TEAM_PICK_WIDTH } from '@/ui/arcade/TeamPick';
import { Print } from '@/ui/arcade/Type';

const TUBE = tubes.cyan;

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2', lamps: 2 },
  { value: 3, label: '3 on 3', lamps: 3 },
];
// one lamp for the easiest level, three for the hardest, for anyone who cannot read the word yet
const LEVELS: readonly Choice<0 | 1 | 2>[] = DIFFICULTY_NAMES.map((label, i) => ({ value: i as 0 | 1 | 2, label, lamps: i + 1 }));
const LEAGUE_TABS = LEAGUES.map((l) => ({ value: l.id, label: l.name }));

/** the label column beside each choice, so the three rows line up */
const LABEL_W = px(66);
const COURT_W = px(86);
const COURT_SCENE = px(30);
const TEAM_GAP = space.sm;
/** room round the lit tiles inside their scrolling rows, so their glow is not cut off at the edge */
const GLOW_ROOM = px(7);

/** A court you can pick, drawn as a little picture of its sky and floor, with its name under it. */
function CourtPick({ id, selected, onPress }: { id: CourtId | null; selected: boolean; onPress: () => void }) {
  const court = id !== null ? COURTS[id] : null;
  const name = court ? court.name : 'Their court';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.court, selected && { borderColor: TUBE.glass, boxShadow: [halo(TUBE.glass, 6, 0.6), inner(TUBE.glass, 12, 0.3)] }, pressed && styles.pressed]}>
      {court ? (
        <View style={[styles.scene, !selected && styles.sceneDim]}>
          <LinearGradient colors={[court.sky.top, court.sky.horizon]} style={StyleSheet.absoluteFill} />
          <View style={[styles.floor, { backgroundColor: court.floor.court, borderTopColor: court.floor.line }]}>
            <View style={[styles.key, { backgroundColor: court.floor.key, borderColor: court.floor.line }]} />
          </View>
        </View>
      ) : (
        // the other team's own court: we only find out which when the game starts
        <View style={[styles.scene, styles.sceneHome]}>
          <LineIcon name="home" size={px(20)} tube={selected ? TUBE : undefined} color={selected ? undefined : night.textFaint} />
        </View>
      )}
      <Print face="bold" size="tiny" color={selected ? 'text' : 'textDim'} center lines={1} room={COURT_W - px(8)} least={0.7}>
        {name}
      </Print>
    </Pressable>
  );
}

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

  // the team tiles share the panel's whole width at every screen size
  const cols = gridW > 0 ? Math.max(1, Math.floor((gridW + TEAM_GAP) / (TEAM_PICK_WIDTH + TEAM_GAP))) : 0;
  const tileW = cols > 0 ? Math.floor((gridW - TEAM_GAP * (cols - 1)) / cols) : TEAM_PICK_WIDTH;

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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courts}>
                <CourtPick id={null} selected={court === null} onPress={() => setCourt(null)} />
                {COURT_IDS.map((id) => (
                  <CourtPick key={id} id={id} selected={court === id} onPress={() => setCourt(id)} />
                ))}
              </ScrollView>
            </Option>
          </NeonPanel>
          <GoldButton label="PLAY!" icon="play" onPress={play} />
        </Arrive>

        <Arrive delay={110} from="right" style={styles.right}>
          <NeonPanel tube="cyan" style={styles.teamsPanel}>
            <SignHead title="WHO DO YOU WANT TO PLAY?" tube="cyan" room={gridW > 0 ? gridW : undefined} style={styles.teamsHead} />
            <ScrollView
              key={league}
              style={styles.teamsScroll}
              contentContainerStyle={styles.teams}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => {
                const w = Math.floor(e.nativeEvent.layout.width - GLOW_ROOM * 2);
                if (w !== gridW) setGridW(w);
              }}>
              {cols > 0 && (
                <>
                  <TeamPick label="Surprise me" selected={picked === null} onPress={() => setOpponent(null)} width={tileW} />
                  {teams.map((t) => (
                    <TeamPick key={t.id} team={t} selected={t.id === picked} onPress={() => setOpponent(t.id)} width={tileW} />
                  ))}
                </>
              )}
            </ScrollView>
          </NeonPanel>
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
    padding: px(10),
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
  courts: {
    gap: space.sm,
    padding: GLOW_ROOM,
  },
  court: {
    width: COURT_W,
    minHeight: sizes.tap,
    padding: px(3),
    paddingBottom: px(4),
    gap: px(3),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rButton,
    overflow: 'hidden',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  scene: {
    height: COURT_SCENE,
    borderRadius: arcade.rButton - px(3),
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  sceneDim: {
    opacity: 0.55,
  },
  sceneHome: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.well,
  },
  floor: {
    height: COURT_SCENE * 0.45,
    borderTopWidth: arcade.hairline,
    alignItems: 'center',
  },
  key: {
    width: COURT_SCENE * 0.6,
    height: COURT_SCENE * 0.3,
    borderWidth: arcade.hairline,
    borderTopWidth: 0,
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
    padding: GLOW_ROOM,
    // a picked tile's glow reaches further up than its sides
    paddingTop: GLOW_ROOM * 1.6,
    paddingBottom: space.md,
  },
});
