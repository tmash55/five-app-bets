/**
 * The collection: every player there is in one grid, a column to a team, lit when found and a dark outline
 * when not. Beside it the player picked in the grid, up close, with what they are good at and where to put them.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, MAX_LEVEL, PLAYERS, boosted, byValue, leagueOf, leagueTeams, levelBonus, teamById, teamPlayers } from '@/data/roster';
import type { PlayerDef, TeamDef } from '@/data/types';
import { RATING_KEYS } from '@/game/sim/ratings';
import { countOwned, levelOf, levelProgress, type Owned } from '@/meta/collection';
import { useSave } from '@/state/save';
import { arcade, halo, neonText, night, rarityPaint, track, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { ArcadeScreen, useArcadeBody } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton } from '@/ui/arcade/Buttons';
import { HeadCell } from '@/ui/arcade/Card';
import { LeagueTabs } from '@/ui/arcade/LeagueTabs';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { SPARE, firstThatFits, fitText } from '@/ui/arcade/fitText';
import { MIN_FIT_LABEL, fitPerson, widthOf } from '@/ui/arcade/measure';
import { Portrait } from '@/ui/arcade/Portrait';
import { Meter, Pips, StatRow } from '@/ui/arcade/SegBar';
import { Chip, NeonPanel, Well, teamLine } from '@/ui/arcade/Surface';
import { ratingLabel } from '@/ui/arcade/ratingLabel';
import { Print } from '@/ui/arcade/Type';
import { UniformsButton } from '@/ui/arcade/UniformLinks';
import { tourStop } from '@/ui/arcade/whereToFind';

const ALL_IDS = PLAYERS.map((p) => p.id);

/** the gaps in the grid, between columns and between rows */
const GAP = px(5);
/** a team's name and count over its column, and the lit line under them */
const HEAD_H = px(22);
/** the gaps in the level line, and between its lamps (the kit's `Pips` spacing) */
const LEVEL_GAP = px(8);
const PIP_GAP = px(5);
/** the room the grid keeps above its column heads and below its last row, inside the panel's height beside it */
const GRID_INSET = px(9);
/** a column head's padding, left and right, and the size of its count */
const HEAD_PAD = px(7);
const HEAD_COUNT = px(11);
/** the space kept above and below the grid and the panel */
const EDGE_Y = px(6);
/** between the grid and the panel */
const SPLIT = px(15);
/** a cell no narrower than this: below it the grid scrolls sideways instead */
const CELL_LEAST = px(44);
/** a cell is at most this much wider than tall, and at most this much taller than wide */
const CELL_WIDEST = 1.6;
const CELL_TALLEST = 1;
/** the panel's inside edge */
const PANEL_PAD = px(10);
/** a rating's row: as tall as its lamps' label, so six of them leave the picture room */
const ROW_SMALL = px(13);
const ROW = px(16);

/** A team's players in the order the grid shows them: the best first. */
function column(team: TeamDef): PlayerDef[] {
  return teamPlayers(team.id).sort(byValue);
}

/** The player to show when the page opens on a league: one just found, then a squad player, then anyone found, then the first. */
function firstPick(league: string, owned: Owned, fresh: readonly string[], squad: readonly string[]): string {
  const ids = leagueTeams(league).flatMap((t) => column(t).map((p) => p.id));
  return ids.find((id) => fresh.includes(id) && (owned[id] ?? 0) > 0) ?? ids.find((id) => squad.includes(id)) ?? ids.find((id) => (owned[id] ?? 0) > 0) ?? ids[0];
}

/** How many players are found out of all of them, in the top bar. */
function Found({ have, of, meter }: { have: number; of: number; meter: boolean }) {
  return (
    <View accessible accessibilityLabel={`${have} of ${of} players found`}>
      <Chip style={styles.found}>
        <Print face="bold" size="body" color={tube.green.glass} glow={tube.green.glass} track="wider">
          {`${have} OF ${of}`}
        </Print>
        {meter && <Meter value={have / Math.max(1, of)} />}
      </Chip>
    </View>
  );
}

function TeamColumn({ team, owned, fresh, picked, cellW, cellH, onPick }: { team: TeamDef; owned: Owned; fresh: readonly string[]; picked: string; cellW: number; cellH: number; onPick: (id: string) => void }) {
  const players = column(team);
  const have = countOwned(
    owned,
    players.map((p) => p.id),
  );
  const line = teamLine(team);
  const full = have === players.length;
  const count = `${have}/${players.length}`;
  // the letters and the count share the column's width: on the narrowest columns both get a little smaller
  const wide = widthOf(team.short, 'bold', neonText.tiny, track.normal) + widthOf(count, 'bold', HEAD_COUNT) + px(4);
  const k = Math.max(MIN_FIT_LABEL, Math.min(1, ((cellW - HEAD_PAD) * SPARE) / wide));
  return (
    <View style={[styles.column, { width: cellW }]}>
      <View accessible accessibilityLabel={`${team.name}: ${have} of ${players.length} found`} style={styles.head}>
        <View style={styles.headWords}>
          <Print face="bold" size={neonText.tiny * k} track="normal">
            {team.short}
          </Print>
          <Print face="bold" size={HEAD_COUNT * k} color={full ? tube.green.glass : 'textDim'}>
            {count}
          </Print>
        </View>
        {/* the team's colour as a lit line, throwing a little light down onto its players */}
        <View style={[styles.headLine, { backgroundColor: line, boxShadow: [halo(line, 6, 0.7)] }]} />
      </View>
      {players.map((p) => {
        const copies = owned[p.id] ?? 0;
        return <HeadCell key={p.id} player={p} level={levelOf(copies)} selected={p.id === picked} fresh={fresh.includes(p.id)} width={cellW} height={cellH} onPress={() => onPick(p.id)} />;
      })}
    </View>
  );
}

/** The level as lamps, and the copies still to find for the next one. */
function LevelLine({ copies, small, inside }: { copies: number; small: boolean; inside: number }) {
  const prog = levelProgress(copies);
  const left = prog.need - prog.have;
  const label = small ? px(11) : px(12.5);
  const pip = small ? px(8) : px(10);
  // the words get what the label and the lamps leave of the row, so the three never run into each other
  const room = inside - widthOf(`LEVEL ${prog.level}`, 'bold', label, track.normal) - (pip * MAX_LEVEL + PIP_GAP * (MAX_LEVEL - 1)) - LEVEL_GAP * 2;
  const words = fitText(firstThatFits(prog.maxed ? ['TOP LEVEL', 'TOP'] : [`${left} MORE ${left === 1 ? 'COPY' : 'COPIES'}`, `${left} MORE`, `+${left}`], 'bold', label, room, 'normal'), 'bold', label, room, 'normal', MIN_FIT_LABEL);
  return (
    <View
      accessible
      accessibilityLabel={prog.maxed ? `Level ${prog.level}, the top level` : `Level ${prog.level}. ${left} more ${left === 1 ? 'copy' : 'copies'} to level ${prog.level + 1}`}
      style={[styles.level, { height: small ? ROW_SMALL : ROW }]}>
      <Print face="bold" size={label} color="textDim" track="normal">
        {`LEVEL ${prog.level}`}
      </Print>
      <Pips have={prog.level} of={MAX_LEVEL} tube="gold" size={pip} style={styles.grow} />
      <Print face="bold" size={words.size} color={prog.maxed ? tube.gold.glass : 'textDim'} track="normal" right>
        {words.text}
      </Print>
    </View>
  );
}

function Detail({ player, width, height }: { player: PlayerDef; width: number; height: number }) {
  const router = useRouter();
  const copies = useSave((s) => s.owned[player.id] ?? 0);
  const inSquad = useSave((s) => s.squad.includes(player.id));
  const level = levelOf(copies);
  const found = level > 0;
  const team = teamById(player.team);
  const rp = rarityPaint[player.rarity];
  const small = width < px(280);
  const inside = width - PANEL_PAD * 2 - arcade.outline * 2;
  const nameSize = Math.min(px(26), Math.max(px(17), Math.round(width * 0.086)));
  const name = fitPerson(player.name.toUpperCase(), 'display', nameSize, inside, 0, player.short?.toUpperCase());
  const ratings = boosted(player.ratings, levelBonus(Math.max(1, level)));
  const best = RATING_KEYS.reduce((a, k) => (ratings[k] > ratings[a] ? k : a), RATING_KEYS[0]);
  const stop = found ? null : tourStop(player.id);
  const teamWords = fitText(`${team.name} · ${player.role}`.toUpperCase(), 'bold', small ? neonText.tiny : neonText.small, inside, 'wide');
  const open = () => router.push({ pathname: '/player/[id]', params: { id: player.id } });

  return (
    <NeonPanel tube={rp.tube} round={arcade.rBig} style={[styles.panel, { width, height }]}>
      <Portrait player={player} level={level} onPress={open} style={styles.portrait} />
      <View style={styles.words}>
        <Print face="display" size={name.size} track="tight" style={{ lineHeight: Math.round(name.size * 1.04) }}>
          {name.text}
        </Print>
        <Print face="bold" size={teamWords.size} color={tube.cyan.soft} track="wide">
          {teamWords.text}
        </Print>
      </View>
      {found ? (
        <View style={[styles.stats, !small && styles.statsWide]}>
          {RATING_KEYS.map((k) => (
            <StatRow key={k} label={ratingLabel(k, small)} value={ratings[k]} tube={k === best ? 'pink' : 'cyan'} small={small} style={{ height: small ? ROW_SMALL : ROW }} />
          ))}
          <LevelLine copies={copies} small={small} inside={inside} />
        </View>
      ) : (
        <Well style={styles.missing}>
          <View style={styles.missingHead}>
            <LineIcon name="lock" size={px(16)} color={night.textFaint} weight={2.4} />
            <Print face="display" size={small ? 'small' : 'body'} color="textDim" track="close">
              NOT FOUND YET
            </Print>
          </View>
          <Print face="body" size={small ? 'tiny' : 'small'} color="textMuted">
            {stop !== null ? `Find them in packs, or win the ${stop} Showdown on the Tour.` : 'Find them in packs. Their ratings show up once you do.'}
          </Print>
        </Well>
      )}
      {!found ? (
        <GoldButton label="GO TO PACKS" icon="pack" size="small" onPress={() => router.push({ pathname: '/packs', params: { tab: 'packs' } })} />
      ) : inSquad ? (
        <GhostButton label="IN YOUR SQUAD" icon="check" tube="green" onPress={() => router.push('/squad')} />
      ) : (
        <GoldButton label="PUT IN SQUAD" size="small" accessibilityLabel={`Put ${player.name} in your squad`} onPress={() => router.push({ pathname: '/squad', params: { add: player.id } })} />
      )}
    </NeonPanel>
  );
}

export default function Collection() {
  const owned = useSave((s) => s.owned);
  const fresh = useSave((s) => s.fresh);
  const squad = useSave((s) => s.squad);
  const markSeen = useSave((s) => s.markSeen);
  const homeTeam = useSave((s) => s.homeTeam);
  const body = useArcadeBody();
  const [league, setLeague] = useState(() => leagueOf(homeTeam));
  // picked once when the page opens (and again for a new league), so the panel does not jump when a new player is looked at elsewhere
  const [picked, setPicked] = useState(() => firstPick(leagueOf(homeTeam), owned, fresh, squad));
  const teams = leagueTeams(league);
  const columns = teams.map(column);
  const rows = Math.max(1, ...columns.map((c) => c.length));
  const shown = columns.some((c) => c.some((p) => p.id === picked)) ? picked : firstPick(league, owned, fresh, squad);
  const player = PLAYERS.find((p) => p.id === shown) ?? PLAYERS[0];

  // the panel takes about a third of the page, the grid the rest; on a narrow phone the panel gives a little first
  const panelW = Math.round(Math.min(px(340), Math.max(px(196), body.width * 0.29)));
  const roomW = body.width - panelW - SPLIT;
  const roomH = body.height - EDGE_Y * 2;
  const gridRoom = roomH - GRID_INSET * 2;
  const fromW = (roomW - GAP * (teams.length - 1)) / teams.length;
  const fromH = (gridRoom - HEAD_H - GAP * rows) / rows;
  const cellW = Math.floor(Math.max(CELL_LEAST, Math.min(fromW, fromH * CELL_WIDEST)));
  const cellH = Math.floor(Math.min(fromH, cellW * CELL_TALLEST));
  const gridH = HEAD_H + (cellH + GAP) * rows;
  const gridW = cellW * teams.length + GAP * (teams.length - 1);
  // the panel stands as tall as the grid and the room above and below it, with a floor so its button always has room
  const panelH = Math.min(roomH, Math.max(gridH + GRID_INSET * 2, px(300)));

  const pick = (id: string) => {
    setPicked(id);
    markSeen(id);
  };
  const changeLeague = (id: string) => {
    setLeague(id);
    setPicked(firstPick(id, owned, fresh, squad));
  };

  const have = countOwned(owned, ALL_IDS);
  return (
    <ArcadeScreen
      title="COLLECTION"
      tube="cyan"
      after={<Found have={have} of={ALL_IDS.length} meter={body.width > px(560)} />}
      right={
        <>
          {/* the uniforms come from the collection: a team's own unlocks with three of its players */}
          <UniformsButton />
          {LEAGUES.length > 1 && <LeagueTabs value={league} onChange={changeLeague} />}
        </>
      }>
      <View style={styles.page}>
        <ScrollView key={league} horizontal showsHorizontalScrollIndicator={false} style={styles.grow} contentContainerStyle={[styles.scroll, { minWidth: roomW }]}>
          <View style={[styles.grid, { width: gridW, height: gridH }]}>
            {teams.map((t) => (
              <TeamColumn key={t.id} team={t} owned={owned} fresh={fresh} picked={shown} cellW={cellW} cellH={cellH} onPick={pick} />
            ))}
          </View>
        </ScrollView>
        <Detail player={player} width={panelW} height={panelH} />
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPLIT,
  },
  grow: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  column: {
    gap: GAP,
  },
  head: {
    height: HEAD_H,
    justifyContent: 'flex-end',
  },
  headWords: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: HEAD_PAD - px(3),
    paddingRight: px(3),
  },
  headLine: {
    height: px(2.5),
    borderRadius: px(1.25),
  },
  panel: {
    paddingHorizontal: PANEL_PAD,
    paddingTop: px(9),
    paddingBottom: PANEL_PAD,
    gap: px(7),
  },
  portrait: {
    flex: 1,
    minHeight: px(56),
  },
  words: {
    gap: px(4),
  },
  stats: {
    gap: px(4),
  },
  statsWide: {
    gap: px(7),
  },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: LEVEL_GAP,
    marginTop: px(2),
  },
  missing: {
    gap: px(6),
  },
  missingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(7),
  },
  found: {
    gap: px(10),
  },
});
