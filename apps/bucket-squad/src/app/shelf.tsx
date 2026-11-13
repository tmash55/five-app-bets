/**
 * The collection: every player of a league in one grid, lit when found and a dark outline when not, sorted the
 * way the tabs over it say (newest found, rarest, best or by team) and scrolling down for the rest. Beside it the
 * player picked in the grid, up close, with what they are good at and where to put them.
 */

import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LEAGUES, MAX_LEVEL, PLAYERS, boosted, byValue, leagueOf, leagueTeams, levelBonus, playerOverall, teamById } from '@/data/roster';
import type { PlayerDef, TeamDef } from '@/data/types';
import { RATING_KEYS } from '@/game/sim/ratings';
import { SHELF_SORTS, countOwned, levelOf, levelProgress, sortShelf, type Owned, type ShelfSort } from '@/meta/collection';
import { useSave } from '@/state/save';
import { arcade, halo, neonText, night, rarityPaint, track, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { ArcadeScreen, useArcadeBody } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton } from '@/ui/arcade/Buttons';
import { HeadCell } from '@/ui/arcade/Card';
import { FadeScroll } from '@/ui/arcade/FadeScroll';
import { LeagueTabs } from '@/ui/arcade/LeagueTabs';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { LitTabs } from '@/ui/arcade/LitTabs';
import { firstThatFits, fitText } from '@/ui/arcade/fitText';
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
const GAP = px(6);
/** the gaps in the level line, and between its lamps (the kit's `Pips` spacing) */
const LEVEL_GAP = px(8);
const PIP_GAP = px(5);
/** the space kept above and below the grid and the panel */
const EDGE_Y = px(6);
/** between the grid and the panel */
const SPLIT = px(15);
/** the grid's panel: its inside edge, and the room its cells' glow needs at the scroll's edges */
const GRID_PAD = px(10);
const GLOW_ROOM = px(6);
/** about how wide a cell is: as many columns as fit, never fewer than this */
const CELL_W = px(76);
const COLS_LEAST = 4;
/** a cell's height for its width */
const CELL_SHAPE = 0.74;
/** the panel's inside edge */
const PANEL_PAD = px(10);
/** a rating's row: as tall as its lamps' label, so six of them leave the picture room */
const ROW_SMALL = px(13);
const ROW = px(16);

/** The players of a league in the order a sort shows them. */
function lineUp(league: string, sort: ShelfSort, owned: Owned): PlayerDef[] {
  const teams = leagueTeams(league).map((t) => t.id);
  return sortShelf(
    PLAYERS.filter((p) => teams.includes(p.team)),
    sort,
    owned,
    byValue,
    (p, level) => playerOverall(p, Math.max(1, level)),
    teams,
  );
}

/** The player to show when the page opens or the league changes: one just found, then a squad player, then anyone found, then the first. */
function firstPick(order: readonly PlayerDef[], owned: Owned, fresh: readonly string[], squad: readonly string[]): string {
  const ids = order.map((p) => p.id);
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

/** Over each team's players when the grid is sorted by team: its name, how many are found, and its colour as a lit line. */
function TeamHead({ team, have, of }: { team: TeamDef; have: number; of: number }) {
  const line = teamLine(team);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${team.name}: ${have} of ${of} found`} style={styles.teamHead}>
      <View style={styles.teamWords}>
        <Print face="bold" size="small" track="wide" upper>
          {team.name}
        </Print>
        <Print face="bold" size="tiny" color={have === of ? tube.green.glass : 'textDim'} track="wider">
          {`${have} OF ${of}`}
        </Print>
      </View>
      <View style={[styles.teamLine, { backgroundColor: line, boxShadow: [halo(line, 6, 0.7)] }]} />
    </View>
  );
}

/** The players in runs of one team each, in the order given. */
function byTeam(order: readonly PlayerDef[]): { team: TeamDef; players: PlayerDef[] }[] {
  const runs: { team: TeamDef; players: PlayerDef[] }[] = [];
  for (const p of order) {
    const last = runs[runs.length - 1];
    if (last && last.team.id === p.team) last.players.push(p);
    else runs.push({ team: teamById(p.team), players: [p] });
  }
  return runs;
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
  const [sort, setSort] = useState<ShelfSort>('new');
  // the order is set when the page opens and when the sort or the league changes, so a player found or looked at
  // meanwhile does not make the grid jump under a finger
  const [order, setOrder] = useState(() => lineUp(leagueOf(homeTeam), 'new', owned));
  // picked once when the page opens (and again for a new league), so the panel does not jump when a new player is looked at elsewhere
  const [picked, setPicked] = useState(() => firstPick(order, owned, fresh, squad));
  const shown = order.some((p) => p.id === picked) ? picked : firstPick(order, owned, fresh, squad);
  const player = PLAYERS.find((p) => p.id === shown) ?? PLAYERS[0];

  // the panel takes about a third of the page, the grid the rest; on a narrow phone the panel gives a little first
  const panelW = Math.round(Math.min(px(340), Math.max(px(196), body.width * 0.29)));
  const roomW = body.width - panelW - SPLIT;
  const height = body.height - EDGE_Y * 2;
  // as many columns of about one size as fit across; the grid scrolls down for the rest
  const inside = roomW - GRID_PAD * 2 - GLOW_ROOM * 2 - arcade.outline * 2;
  const cols = Math.max(COLS_LEAST, Math.floor((inside + GAP) / (CELL_W + GAP)));
  const cellW = Math.floor((inside - GAP * (cols - 1)) / cols);
  const cellH = Math.round(cellW * CELL_SHAPE);

  const pick = (id: string) => {
    setPicked(id);
    markSeen(id);
  };
  const changeLeague = (id: string) => {
    const next = lineUp(id, sort, owned);
    setLeague(id);
    setOrder(next);
    setPicked(firstPick(next, owned, fresh, squad));
  };
  const changeSort = (to: ShelfSort) => {
    setSort(to);
    setOrder(lineUp(league, to, owned));
  };

  const cell = (p: PlayerDef) => <HeadCell key={p.id} player={p} level={levelOf(owned[p.id] ?? 0)} selected={p.id === shown} fresh={fresh.includes(p.id)} width={cellW} height={cellH} onPress={() => pick(p.id)} />;

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
        <NeonPanel tube="cyan" lit={false} style={[styles.gridPanel, { width: roomW, height }]}>
          <View style={styles.sortRow}>
            <Print face="bold" size="tiny" color="textFaint" track="wider">
              SORT
            </Print>
            <LitTabs tabs={SHELF_SORTS} value={sort} onChange={changeSort} />
          </View>
          <FadeScroll key={`${league}:${sort}`} reach={px(30)} style={styles.grow} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {sort === 'team'
              ? byTeam(order).map((run) => (
                  <Fragment key={run.team.id}>
                    <TeamHead team={run.team} have={countOwned(owned, run.players.map((p) => p.id))} of={run.players.length} />
                    {run.players.map(cell)}
                  </Fragment>
                ))
              : order.map(cell)}
          </FadeScroll>
        </NeonPanel>
        <Detail player={player} width={panelW} height={height} />
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
  gridPanel: {
    paddingTop: px(8),
    paddingHorizontal: GRID_PAD,
    gap: px(4),
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(8),
    paddingHorizontal: GLOW_ROOM,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    padding: GLOW_ROOM,
    paddingBottom: px(14),
  },
  teamHead: {
    width: '100%',
    gap: px(4),
    marginTop: px(4),
  },
  teamWords: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: px(2),
  },
  teamLine: {
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
