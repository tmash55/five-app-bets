/**
 * Uniforms: what the whole squad wears. The captain's team's colours to start with, special designs bought with
 * coins, limited editions sold only on their day in the Daily Shop, and every team's own uniform, which unlocks once three of its players are in the collection. Beside the
 * grid, the uniform the squad wears now, up close.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { LEAGUES, leagueOf, mustPlayer, teamById } from '@/data/roster';
import { RARITY_LABEL, type TeamDef } from '@/data/types';
import { LIMITED_UNIFORMS, SPECIAL_UNIFORMS, TEAM_UNIFORMS, teamWear, wearOf, type UniformDef, type Wear } from '@/data/uniforms';
import { tapFeedback } from '@/fx/feedback';
import { dayKey } from '@/meta/rng';
import { limitedSlot } from '@/meta/shop';
import { squadUniform, uniformProgress, type UniformProgress } from '@/state/logic';
import { useSave } from '@/state/save';
import { arcade, fade, halo, inner, neonText, night, tube, type Tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen, useArcadeBody } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton, RoundButton } from '@/ui/arcade/Buttons';
import { Gems } from '@/ui/arcade/Card';
import { SignHead } from '@/ui/arcade/Controls';
import { Face } from '@/ui/arcade/Face';
import { FadeScroll } from '@/ui/arcade/FadeScroll';
import { fitText } from '@/ui/arcade/fitText';
import { JERSEY_FULL_RATIO, JERSEY_RATIO, Jersey } from '@/ui/arcade/Jersey';
import { LeagueTabs } from '@/ui/arcade/LeagueTabs';
import { Coin, LineIcon } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL } from '@/ui/arcade/measure';
import { Arrive } from '@/ui/arcade/Motion';
import { Popup } from '@/ui/arcade/Popup';
import { StageRing } from '@/ui/arcade/Room';
import { NeonPanel, Tag, TeamMark } from '@/ui/arcade/Surface';
import { teamTube } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';
import { wornName } from '@/ui/arcade/UniformLinks';
import { columnsThatFit, rowsOf } from '@/ui/rows';

/** the page's own tube */
const TUBE = tube.orange;
/** what wearing looks like everywhere on the page: lit green with a check */
const ON = tube.green;
/** between the panel of what is worn and the grid */
const SPLIT = px(14);
/** the gaps in the grid */
const GAP = px(8);
/** a tile no narrower than this */
const TILE_LEAST = px(96);
/** inside a tile: its padding, the row of gems or letters over the jersey, the name and the line under it */
const TILE_PAD = px(6);
const TILE_TOP = px(16);
const TILE_NAME = px(18);
const TILE_FOOT = px(20);
/** the grid's panel: its padding */
const PANEL_PAD = px(12);
/** the round badge on a tile's corner */
const BADGE = px(22);
/** the popup's big jersey */
const BIG_JERSEY = px(124);

/** One place in the grid: a uniform, or (null) the captain's team's colours. */
type Entry = UniformDef | null;

interface EntryState {
  wear: Wear;
  /** the team it belongs to: a team uniform's, or the captain's for the captain's colours */
  team: TeamDef | null;
  name: string;
  wearing: boolean;
  progress: UniformProgress;
}

function tubeOfWear(wear: Wear): Tube {
  return teamTube(wear);
}

/** The corner badge: a check when worn, a lock when still to earn. */
function CornerBadge({ kind }: { kind: 'on' | 'lock' }) {
  const on = kind === 'on';
  return (
    <View style={[styles.badge, on ? { backgroundColor: ON.glass, borderColor: ON.glass, boxShadow: [halo(ON.glass, 8, 1)] } : styles.badgeLock]}>
      <LineIcon name={on ? 'check' : 'lock'} size={px(13)} color={on ? night.onTube : tube.gold.soft} weight={on ? 3.6 : 2.4} />
    </View>
  );
}

/** The id of the limited uniform in today's Daily Shop, if today is a uniform day. */
function limitedToday(): string | null {
  const item = limitedSlot(dayKey())?.item;
  return item?.kind === 'uniform' ? item.id : null;
}

/** The line at the foot of a tile: worn, yours, how many players still to find, or the price. */
function TileFoot({ entry, state, coins }: { entry: Entry; state: EntryState; coins: number }) {
  if (state.wearing) return <Tag label="WEARING" tube={ON} small />;
  if (state.progress.unlocked)
    return (
      <View style={styles.footRow}>
        <LineIcon name="check" size={px(12)} color={ON.soft} weight={3} />
        <Print face="bold" size="micro" color={ON.soft} track="wide">
          YOURS
        </Print>
      </View>
    );
  if (entry?.limited) {
    // a limited edition is never bought here: today's shows it is in the shop, the others where to look for them
    if (limitedToday() === entry.id) return <Tag label="IN SHOP TODAY" tube="gold" small />;
    return (
      <View style={styles.footRow}>
        <LineIcon name="clock" size={px(13)} color={night.textFaint} weight={2.4} />
        <Print face="bold" size="micro" color="textFaint" track="wide">
          DAILY SHOP
        </Print>
      </View>
    );
  }
  if (entry?.kind === 'special' && entry.price !== undefined) {
    const can = coins >= entry.price;
    return (
      <View style={styles.footRow}>
        <Coin size={px(13)} />
        <Print face="bold" size="small" color={can ? tube.gold.glass : 'textFaint'} track="wide">
          {entry.price.toLocaleString('en-US')}
        </Print>
      </View>
    );
  }
  const { have, need } = state.progress;
  return (
    <View style={styles.footRow}>
      {Array.from({ length: need }, (_, i) => (
        <LineIcon key={i} name="squad" size={px(16)} tube={i < have ? 'cyan' : undefined} color={i < have ? undefined : night.textFaint} weight={2.4} />
      ))}
    </View>
  );
}

function Tile({ entry, state, coins, number, width, height, onPress }: { entry: Entry; state: EntryState; coins: number; number: number; width: number; height: number; onPress: () => void }) {
  const tb = tubeOfWear(state.wear);
  const lockedTeam = !state.progress.unlocked && entry?.kind === 'team';
  const lockedLimited = !state.progress.unlocked && entry?.limited === true && limitedToday() !== entry.id;
  const lit = state.wearing ? ON : state.progress.unlocked ? tb : null;
  const room = width - TILE_PAD * 2 - arcade.outline * 2;
  const jerseyW = Math.min(room * 0.7, (height - TILE_TOP - TILE_NAME - TILE_FOOT - TILE_PAD * 2 - arcade.outline * 2) / JERSEY_RATIO);
  const team = entry === null ? null : state.team;
  const label = `${state.name}. ${state.wearing ? 'Wearing it' : state.progress.unlocked ? 'Yours: tap to wear' : entry?.limited ? 'Only in the Daily Shop' : entry?.kind === 'special' ? `${entry.price} coins` : `${state.progress.have} of ${state.progress.need} players`}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: state.wearing }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        { width, height },
        lit ? { borderColor: lit.glass, boxShadow: state.wearing ? [halo(lit.glass, 14, 0.9), inner(lit.glass, 18, 0.35)] : [halo(lit.glass, 8, 0.45)] } : undefined,
        pressed && styles.pressed,
      ]}>
      <View style={styles.tileTop}>
        {entry === null ? <LineIcon name="crown" size={px(14)} tube="gold" weight={2.4} /> : team ? <TeamMark team={team} small /> : <Gems rarity={entry.rarity} size={px(9)} />}
      </View>
      <View style={styles.tileMiddle}>
        <Jersey kit={state.wear.kit} number={number} width={jerseyW} dim={lockedTeam} />
        {lockedTeam && (
          <View style={styles.tileLock}>
            <LineIcon name="lock" size={px(22)} tube="gold" weight={2.4} />
          </View>
        )}
      </View>
      <Print face="bold" size="small" color={lit ? 'text' : 'textDim'} track="tight" center room={room} least={MIN_FIT_LABEL} style={styles.tileName}>
        {state.name}
      </Print>
      <View style={styles.tileFoot}>
        <TileFoot entry={entry} state={state} coins={coins} />
      </View>
      {(state.wearing || lockedTeam || lockedLimited) && <CornerBadge kind={state.wearing ? 'on' : 'lock'} />}
    </Pressable>
  );
}

/** The uniform the squad wears now, up close: on a lit ring, with the three who wear it. */
function Wearing({ entry, state, squad, number, width, height }: { entry: Entry; state: EntryState; squad: readonly string[]; number: number; width: number; height: number }) {
  const tb = tubeOfWear(state.wear);
  const inside = width - px(12) * 2 - arcade.outline * 2;
  const face = Math.min(px(34), Math.floor((inside - space.sm * 2) / 3));
  const jerseyW = Math.max(px(50), Math.min(inside * 0.72, (height - px(150) - face) / JERSEY_FULL_RATIO));
  const name = fitText(state.name.toUpperCase(), 'display', neonText.sign, inside, 'close', MIN_FIT_LABEL);
  const kind = entry === null ? `${state.team?.name ?? ''} · CAPTAIN’S TEAM` : entry.kind === 'team' ? 'TEAM UNIFORM' : `SPECIAL · ${RARITY_LABEL[entry.rarity]}`;
  return (
    <NeonPanel tube={tb} style={[styles.wearing, { width, height }]}>
      <Print face="bold" size="tiny" color="textFaint" track="wider" center>
        YOUR SQUAD WEARS
      </Print>
      <View style={styles.wearStage}>
        <StageRing width={jerseyW * 1.5} height={px(30)} tube={tb} style={styles.wearRing} />
        <Arrive key={state.wear.id} from="pop">
          <Jersey kit={state.wear.kit} number={number} width={jerseyW} shorts />
        </Arrive>
      </View>
      <View style={styles.wearWords}>
        {name.text.split('\n').map((line) => (
          <Glow key={line} face="display" size={name.size} tube={tb} track="close" center>
            {line}
          </Glow>
        ))}
        <Print face="bold" size="micro" color={tb.soft} track="wide" center room={inside} least={MIN_FIT_LABEL} upper>
          {kind}
        </Print>
      </View>
      <View style={styles.faces}>
        {squad.slice(0, 3).map((id) => (
          <Face key={id} id={id} size={face} />
        ))}
      </View>
    </NeonPanel>
  );
}

/** Up close: a big jersey, what it is, how to get it, and the one thing to do with it. */
function Detail({ entry, state, coins, number, onWear, onBuy, onClose }: { entry: Entry; state: EntryState; coins: number; number: number; onWear: () => void; onBuy: () => void; onClose: () => void }) {
  const router = useRouter();
  const tb = tubeOfWear(state.wear);
  const team = entry === null ? null : state.team;
  const words = px(300);
  const name = fitText(state.name.toUpperCase(), 'display', neonText.big, words, 'close', MIN_FIT_LABEL);
  const { have, need, unlocked } = state.progress;
  const left = need - have;
  let kind: string;
  let about: string;
  if (entry === null) {
    kind = `${state.team?.name ?? ''} · your captain’s team`;
    about = 'The whole squad wears your captain’s team uniform. Pick a new captain on the Squad page and it changes with them.';
  } else if (entry.limited) {
    kind = 'Limited edition · Daily Shop only';
    about = `${entry.blurb ?? ''} ${unlocked ? 'It is yours to wear any time.' : limitedToday() === entry.id ? 'It is in the Daily Shop today!' : 'It is only sold in the Daily Shop, on its day. Look in again soon.'}`.trim();
  } else if (entry.kind === 'special') {
    kind = `Special · ${RARITY_LABEL[entry.rarity]}`;
    about = `${entry.blurb ?? ''} ${unlocked ? 'It is yours to wear any time.' : 'Buy it with coins and the whole squad wears it.'}`.trim();
  } else {
    kind = `${team ? `${team.place} ${team.name}` : entry.name} · team uniform`;
    about = unlocked ? `You have ${need === 1 ? 'the' : need} ${entry.name} player${need === 1 ? '' : 's'} it takes, so it is yours to wear.` : `Collect ${need} ${entry.name} player${need === 1 ? '' : 's'} to unlock it. You have ${have}.`;
  }
  const short = entry?.price !== undefined ? entry.price - coins : 0;
  return (
    <Popup onDismiss={onClose} tube={state.wearing ? ON : tb} width={px(540)} style={styles.detail}>
      <View style={styles.detailRow}>
        <View style={styles.detailJersey}>
          <StageRing width={BIG_JERSEY * 1.4} height={px(30)} tube={tb} style={styles.detailRing} />
          <Jersey kit={state.wear.kit} number={number} width={BIG_JERSEY} shorts dim={!unlocked && entry?.kind === 'team'} />
          {!unlocked && entry?.kind === 'team' && (
            <View style={styles.detailLock}>
              <LineIcon name="lock" size={px(40)} tube="gold" weight={2.2} />
            </View>
          )}
        </View>
        <View style={styles.detailWords}>
          <View style={styles.detailHead}>
            {entry === null ? <LineIcon name="crown" size={px(18)} tube="gold" /> : team ? <TeamMark team={team} /> : <Gems rarity={entry.rarity} size={px(11)} />}
            <Print face="bold" size="tiny" color={tb.soft} track="wide" upper room={words - px(60)} least={MIN_FIT_LABEL}>
              {kind}
            </Print>
          </View>
          {name.text.split('\n').map((line) => (
            <Glow key={line} face="display" size={name.size} tube={tb} track="close">
              {line}
            </Glow>
          ))}
          <Print face="medium" size="small" color="textMuted">
            {about}
          </Print>
          {entry?.kind === 'team' && !unlocked && (
            <View style={styles.detailPlayers} accessible accessibilityLabel={`${have} of ${need} players`}>
              {Array.from({ length: need }, (_, i) => (
                <LineIcon key={i} name="squad" size={px(24)} tube={i < have ? 'cyan' : undefined} color={i < have ? undefined : night.lineLit} weight={2.2} />
              ))}
              <Print face="display" size="large" color={tube.cyan.tint} track="close">
                {`${have}/${need}`}
              </Print>
            </View>
          )}
          <View style={styles.detailAction}>
            {state.wearing ? (
              <GhostButton label="WEARING" icon="check" tube={ON} disabled accessibilityLabel="Your squad is wearing it" style={styles.detailButton} />
            ) : unlocked ? (
              <GoldButton label="WEAR IT" icon="check" size="small" quiet onPress={onWear} style={styles.detailButton} />
            ) : entry?.limited ? (
              limitedToday() === entry.id ? (
                <GoldButton label="TO THE SHOP" icon="tag" size="small" onPress={() => router.push('/packs')} accessibilityLabel="It is in the Daily Shop today. Go to the shop" style={styles.detailButton} />
              ) : (
                <GhostButton label="DAILY SHOP" icon="clock" tube="gold" onPress={() => router.push('/packs')} accessibilityLabel="Only sold in the Daily Shop. Go to the shop" style={styles.detailButton} />
              )
            ) : entry?.kind === 'special' && entry.price !== undefined ? (
              <View style={styles.buy}>
                <GoldButton
                  label={`BUY  ${entry.price.toLocaleString('en-US')}`}
                  art={<Coin size={px(20)} />}
                  size="small"
                  quiet
                  disabled={short > 0}
                  onPress={onBuy}
                  accessibilityLabel={short > 0 ? `${entry.name} costs ${entry.price} coins. You need ${short} more` : `Buy ${entry.name} for ${entry.price} coins`}
                  style={styles.detailButton}
                />
                {short > 0 && (
                  <Print face="bold" size="tiny" color={tube.pink.soft} track="normal">
                    {`${short.toLocaleString('en-US')} MORE TO GO`}
                  </Print>
                )}
              </View>
            ) : (
              <GhostButton label={`COLLECT ${left} MORE ${(entry?.name ?? '').toUpperCase()}`} icon="pack" tube="cyan" accessibilityLabel={`Collect ${left} more ${entry?.name ?? ''} ${left === 1 ? 'player' : 'players'}. Go to packs`} onPress={() => router.push({ pathname: '/packs', params: { tab: 'packs' } })} style={styles.detailButton} />
            )}
          </View>
        </View>
      </View>
      <View style={styles.close}>
        <RoundButton icon="close" label="Close" onPress={onClose} sound="back" />
      </View>
    </Popup>
  );
}

export default function Uniforms() {
  const owned = useSave((s) => s.owned);
  const uniforms = useSave((s) => s.uniforms);
  const uniform = useSave((s) => s.uniform);
  const squad = useSave((s) => s.squad);
  const homeTeam = useSave((s) => s.homeTeam);
  const coins = useSave((s) => s.coins);
  const buyUniform = useSave((s) => s.buyUniform);
  const wearUniform = useSave((s) => s.wearUniform);
  const body = useArcadeBody();
  const worn = squadUniform({ squad, uniform, homeTeam });
  const [league, setLeague] = useState(() => leagueOf(worn.captainTeam.id));
  const [open, setOpen] = useState<{ entry: Entry } | null>(null);
  // the captain's number goes on every jersey, so each one reads as the squad's own
  const number = squad.length > 0 ? mustPlayer(squad[0]).number : 1;

  const stateOf = (entry: Entry): EntryState => {
    if (entry === null) return { wear: teamWear(worn.captainTeam), team: worn.captainTeam, name: wornName(null), wearing: worn.def === null, progress: { have: 1, need: 1, unlocked: true } };
    return { wear: wearOf(entry), team: entry.team !== undefined ? teamById(entry.team) : null, name: entry.name, wearing: worn.def?.id === entry.id, progress: uniformProgress({ owned, uniforms }, entry) };
  };

  const wear = (entry: Entry) => {
    if (!wearUniform(entry === null ? null : entry.id)) return;
    playSfx('lock');
    setOpen(null);
  };
  const buy = (entry: UniformDef) => {
    if (!buyUniform(entry.id)) {
      playSfx('back');
      return;
    }
    // bought to be worn: the squad puts it straight on
    playSfx('buy');
    wearUniform(entry.id);
    setOpen(null);
  };

  const wearingW = Math.round(Math.min(px(250), Math.max(px(184), body.width * 0.25)));
  const panelW = body.width - wearingW - SPLIT;
  const inside = panelW - PANEL_PAD * 2 - arcade.outline * 2;
  const columns = columnsThatFit(inside, TILE_LEAST, GAP);
  const tileW = Math.floor((inside - GAP * (columns - 1)) / columns);
  const tileH = Math.round(tileW * 0.52 * JERSEY_RATIO + TILE_TOP + TILE_NAME + TILE_FOOT + TILE_PAD * 2 + arcade.outline * 2);
  const height = body.height - space.sm;

  const specials: Entry[] = [null, ...SPECIAL_UNIFORMS];
  const teams: Entry[] = TEAM_UNIFORMS.filter((u) => u.league === league);
  const boughtCount = SPECIAL_UNIFORMS.filter((u) => uniforms.includes(u.id)).length;
  const limitedCount = LIMITED_UNIFORMS.filter((u) => uniforms.includes(u.id)).length;
  const teamCount = TEAM_UNIFORMS.filter((u) => uniformProgress({ owned, uniforms }, u).unlocked).length;

  const grid = (entries: Entry[]) => (
    <View style={styles.rows}>
      {rowsOf(entries, columns).map((row) => (
        <View key={row[0]?.id ?? 'captain'} style={styles.row}>
          {row.map((e) => (
            <Tile key={e?.id ?? 'captain'} entry={e} state={stateOf(e)} coins={coins} number={number} width={tileW} height={tileH} onPress={() => setOpen({ entry: e })} />
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <ArcadeScreen title="UNIFORMS" tube={TUBE} right={LEAGUES.length > 1 ? <LeagueTabs value={league} onChange={setLeague} /> : undefined} style={styles.body}>
        <View style={styles.page}>
          <Wearing entry={worn.def} state={stateOf(worn.def)} squad={squad} number={number} width={wearingW} height={height} />
          <NeonPanel tube={TUBE} style={[styles.panel, { width: panelW, height }]}>
            <FadeScroll reach={px(30)} style={styles.grow} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <SignHead
                title="SPECIALS"
                tube={TUBE}
                right={
                  <View style={styles.headRight}>
                    <Coin size={px(14)} />
                    <Print face="bold" size="tiny" color="textFaint" track="wider">
                      {`BUY WITH COINS · ${boughtCount} OF ${SPECIAL_UNIFORMS.length}`}
                    </Print>
                  </View>
                }
              />
              {grid(specials)}
              <SignHead
                title="LIMITED"
                tube="gold"
                style={styles.secondHead}
                right={
                  <View style={styles.headRight}>
                    <LineIcon name="clock" size={px(14)} color={night.textFaint} weight={2.4} />
                    <Print face="bold" size="tiny" color="textFaint" track="wider">
                      {`ONLY IN THE DAILY SHOP · ${limitedCount} OF ${LIMITED_UNIFORMS.length}`}
                    </Print>
                  </View>
                }
              />
              {grid([...LIMITED_UNIFORMS])}
              <SignHead
                title="TEAM UNIFORMS"
                tube="cyan"
                style={styles.secondHead}
                right={
                  <View style={styles.headRight}>
                    <LineIcon name="squad" size={px(14)} color={night.textFaint} weight={2.4} />
                    <Print face="bold" size="tiny" color="textFaint" track="wider">
                      {`3 PLAYERS OF A TEAM · ${teamCount} OF ${TEAM_UNIFORMS.length}`}
                    </Print>
                  </View>
                }
              />
              {grid(teams)}
            </FadeScroll>
          </NeonPanel>
        </View>
      </ArcadeScreen>
      {open && <Detail entry={open.entry} state={stateOf(open.entry)} coins={coins} number={number} onWear={() => wear(open.entry)} onBuy={() => open.entry && buy(open.entry)} onClose={() => setOpen(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    paddingTop: space.sm,
  },
  page: {
    flex: 1,
    flexDirection: 'row',
    gap: SPLIT,
  },
  grow: {
    flex: 1,
  },
  panel: {
    paddingTop: px(10),
    paddingHorizontal: PANEL_PAD,
    overflow: 'hidden',
  },
  scroll: {
    paddingBottom: px(14),
    gap: space.sm,
  },
  secondHead: {
    marginTop: space.md,
  },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: px(6),
  },
  rows: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  tile: {
    alignItems: 'center',
    padding: TILE_PAD,
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rTile,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  tileTop: {
    height: TILE_TOP,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileMiddle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLock: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    height: TILE_NAME,
  },
  tileFoot: {
    height: TILE_FOOT,
    justifyContent: 'center',
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(4),
  },
  badge: {
    position: 'absolute',
    top: px(5),
    right: px(5),
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: arcade.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLock: {
    backgroundColor: night.pit,
    borderColor: fade(tube.gold.glass, 0.6),
  },
  wearing: {
    paddingHorizontal: px(12),
    paddingVertical: px(10),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wearStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wearRing: {
    position: 'absolute',
    bottom: px(2),
    alignSelf: 'center',
  },
  wearWords: {
    alignItems: 'center',
    gap: px(2),
  },
  faces: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  detail: {
    gap: space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  detailJersey: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: px(10),
  },
  detailRing: {
    position: 'absolute',
    bottom: -px(10),
    alignSelf: 'center',
  },
  detailLock: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailWords: {
    flex: 1,
    gap: px(6),
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(8),
    paddingRight: px(36),
  },
  detailPlayers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
  },
  detailAction: {
    marginTop: space.sm,
    alignItems: 'flex-start',
  },
  detailButton: {
    minWidth: px(180),
  },
  buy: {
    gap: px(5),
  },
  close: {
    position: 'absolute',
    top: px(4),
    right: px(4),
  },
});
