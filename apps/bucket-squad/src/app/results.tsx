/** After the final buzzer: the score, the best player, and every coin and prize the game earned, in lights. */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { playSfx, setMusic } from '@/audio/sound';
import { mustPlayer, playerOverall, teamById } from '@/data/roster';
import { buzz } from '@/fx/feedback';
import { levelOf, type Gain } from '@/meta/collection';
import { tierProgress, type Tier } from '@/meta/ladder';
import type { MatchSetup, MatchSummary, PlayerLine } from '@/meta/match';
import type { RewardLine } from '@/meta/rewards';
import { packById } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import { nextTourGame, tourById, type Tour } from '@/meta/tour';
import type { MatchOutcome } from '@/state/logic';
import { startNext } from '@/state/play';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { arcade, goldButton, halo, neonLeading, night, tube as tubes } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { useCountUp } from '@/ui/Bits';
import { useAfter } from '@/ui/hooks';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { DECK_H, GhostButton, GoldButton, KeyButton } from '@/ui/arcade/Buttons';
import { ArcadeCard } from '@/ui/arcade/Card';
import { SignHead, Star } from '@/ui/arcade/Controls';
import { Face } from '@/ui/arcade/Face';
import { LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { TierMedal, tierIndexOf, tierTube } from '@/ui/arcade/Medal';
import { FoilPack } from '@/ui/arcade/Foil';
import { Arrive, Breathe, Bump } from '@/ui/arcade/Motion';
import { Popup } from '@/ui/arcade/Popup';
import { CoinAmount, PackPrize } from '@/ui/arcade/Rewards';
import { Rays } from '@/ui/arcade/Room';
import { SegBar, lampsFor } from '@/ui/arcade/SegBar';
import { Sparks } from '@/ui/arcade/Sparks';
import { Chip, NeonPanel, Plate, Tag, TeamMark, Well } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

type Moment = { kind: 'player'; gain: Gain } | { kind: 'tier'; tier: Tier };

/** time between reward lines appearing */
const LINE_MS = 240;
const LINES_START = 500;
/** the tour stars light one after another, in step with the first reward lines */
const STARS_START = 420;
const STAR_MS = 320;
const SCORE = px(56);
/** the buttons at the bottom come up once the score and the best player are in */
const DECK_AT = 260;
const STAR = px(30);
const MOMENT_CARD = sizes.card + space.md;
/** once the coins are in, the ladder points count up and the bar fills, lamp by lamp, over this long */
const LADDER_MS = 650;
/** then each prize pops in, this long after the last */
const PRIZE_MS = 180;

/** How many of the ladder bar's ten lamps a number of points lights, within its tier. */
function ladderLamps(points: number): { index: number; lamps: number } {
  const tp = tierProgress(points);
  return { index: tp.index, lamps: tp.next ? lampsFor(tp.span > 0 ? (tp.have / tp.span) * 100 : 100) : 10 };
}

/** The packs a game won, in the order they show. */
function packsWon(outcome: MatchOutcome): string[] {
  const out: string[] = [];
  if (outcome.tour?.pack) out.push(outcome.tour.pack);
  if (outcome.tour?.starPack) out.push(outcome.tour.starPack);
  if (outcome.ladder?.promoted?.reward.pack) out.push(outcome.ladder.promoted.reward.pack);
  return out;
}

/** What happens after the coins are in: the ladder bar's lamps from and to (a new tier starts from empty), and how many prizes pop in. */
function afterCoins(outcome: MatchOutcome): { ladder: { from: number; to: number } | null; prizes: number } {
  const prizes = packsWon(outcome).length + outcome.missionsDone.length + (outcome.tour?.unlock ? 1 : 0);
  if (!outcome.ladder) return { ladder: null, prizes };
  const was = ladderLamps(outcome.ladder.before);
  const now = ladderLamps(outcome.ladder.after);
  return { ladder: { from: was.index === now.index ? was.lamps : was.index < now.index ? 0 : 10, to: now.lamps }, prizes };
}

function statLine(p: PlayerLine): string {
  const parts = [`${p.points} PTS`];
  if (p.rebounds > 0) parts.push(`${p.rebounds} REB`);
  if (p.assists > 0) parts.push(`${p.assists} AST`);
  if (p.steals > 0) parts.push(`${p.steals} STL`);
  if (p.blocks > 0) parts.push(`${p.blocks} BLK`);
  return parts.slice(0, 4).join('  ·  ');
}

/** What the yellow button at the bottom says: what it does, the game it starts, and its picture. */
function goNext(setup: MatchSetup, won: boolean, tour: Tour | null, nextStop: { stage: number; game: number } | null): { label: string; sub: string; icon: LineIconName } {
  const label = setup.mode === 'duo' ? 'REMATCH' : nextStop ? 'NEXT GAME' : won ? 'PLAY AGAIN' : 'TRY AGAIN';
  const icon: LineIconName = nextStop ? 'play' : 'again';
  const at = nextStop ?? (setup.tour ? { stage: setup.tour.stage, game: setup.tour.game } : null);
  const stop = tour && at ? tour.stages[at.stage] : undefined;
  const game = stop?.games[at?.game ?? 0];
  if (stop && game) return { label, icon, sub: `${stop.team.name} · ${game.title}`.toUpperCase() };
  const size = `${setup.perTeam} ON ${setup.perTeam}`;
  return { label, icon, sub: setup.mode === 'ladder' ? `LADDER · ${size}` : setup.mode === 'duo' ? `2 PLAYERS · ${size}` : `QUICK GAME · ${size}` };
}

/** A two-player game: which of the two won (the home side, P1, is the device's squad). */
function duoWinner(s: MatchSummary): 0 | 1 {
  return s.score[0] > s.score[1] ? 0 : 1;
}

function headline(s: MatchSummary): string {
  if (s.mode === 'duo') return duoWinner(s) === 0 ? 'P1 WINS!' : 'P2 WINS!';
  if (s.won) return s.buzzerBeater ? 'AT THE BUZZER!' : s.score[0] - s.score[1] >= 10 ? 'BIG WIN!' : 'YOU WIN!';
  return s.score[1] - s.score[0] <= 3 ? 'SO CLOSE!' : 'GOOD GAME!';
}

function MomentOverlay({ moment, onClose }: { moment: Moment; onClose: () => void }) {
  useEffect(() => {
    playSfx(moment.kind === 'player' ? 'revealEpic' : 'levelUp');
    buzz('success');
  }, [moment]);
  if (moment.kind === 'player') {
    const player = mustPlayer(moment.gain.playerId);
    const title = moment.gain.isNew ? 'NEW PLAYER!' : moment.gain.levelAfter > moment.gain.levelBefore ? 'LEVEL UP!' : 'EXTRA COPY!';
    return (
      <Popup tube="gold" width={sizes.panelMax - px(60)} style={styles.moment}>
        {/* first, so it is behind everything in the pop-up, and from its edges outward, so it frames it */}
        <Sparks burst={1} around count={36} reach={170} />
        <View>
          <Rays size={MOMENT_CARD * 2.6} color={tubes.gold.glass} alpha={0.26} count={18} fill={0.3} fadeAt={[0.25, 0.9]} style={styles.momentRays} />
          <Arrive>
            <ArcadeCard player={player} level={Math.max(1, moment.gain.levelAfter)} width={MOMENT_CARD} shine />
          </Arrive>
        </View>
        <View style={styles.momentText}>
          <Glow face="display" size="title" tube="gold" track="close">
            {title}
          </Glow>
          <Print face="display" size="large" color="text">
            {player.name}
          </Print>
          <Print face="medium" size="body" color="textSoft">
            {moment.gain.isNew ? `You beat the ${teamById(player.team).name}, so their star joins your collection.` : 'You already had this star, so they got stronger.'}
          </Print>
          <GoldButton label="AWESOME!" size="small" onPress={onClose} />
        </View>
      </Popup>
    );
  }
  const { tier } = moment;
  const index = tierIndexOf(tier.name);
  return (
    <Popup tube={tierTube(index)} width={sizes.panelMax - px(140)} style={styles.tierPanel}>
      <Sparks burst={1} around count={36} reach={170} />
      <View>
        <Rays size={px(220)} color={tierTube(index).glass} alpha={0.3} count={18} fill={0.32} fadeAt={[0.2, 0.9]} style={styles.tierRays} />
        <Arrive>
          <TierMedal index={index} size={px(80)} />
        </Arrive>
      </View>
      <Glow face="display" size="title" tube={tierTube(index)} track="close" center>
        {`${tier.name.toUpperCase()} TIER!`}
      </Glow>
      <Print face="medium" size="body" color="textSoft" center>
        You climbed the Ladder. Here is your prize.
      </Print>
      <View style={styles.prizeRow}>
        {tier.reward.coins > 0 && <CoinAmount coins={tier.reward.coins} size="large" plus />}
        {tier.reward.pack !== undefined && <PackPrize packId={tier.reward.pack} width={px(30)} />}
      </View>
      <GoldButton label="LET'S GO!" onPress={onClose} style={styles.wide} />
    </Popup>
  );
}

/** One side of the scoreboard: its name over its score, the winner's lit gold. */
function ScoreSide({ name, score, lit, mark }: { name: string; score: number; lit: boolean; mark?: React.ReactNode }) {
  return (
    <View style={styles.scoreSide}>
      <View style={styles.scoreName}>
        {mark}
        <Print face="bold" size="small" color={lit ? 'text' : 'textDim'} track="wide" lines={1}>
          {name.toUpperCase()}
        </Print>
      </View>
      <Glow face="display" size={SCORE} tube={lit ? 'gold' : 'steel'} lit={lit} track="close">
        {String(score)}
      </Glow>
    </View>
  );
}

function Body({ summary, outcome, setup }: { summary: MatchSummary; outcome: MatchOutcome; setup: MatchSetup }) {
  const router = useRouter();
  const after = useAfter();
  const packs = useSave((s) => s.packs);
  const freePackDay = useSave((s) => s.freePackDay);
  const bank = useSave((s) => s.coins);
  const tourProgress = useSave((s) => s.tour);
  const owned = useSave((s) => s.owned);
  const homeTeam = useSave((s) => s.homeTeam);
  const [lines] = useState<RewardLine[]>(() => {
    const all = [...outcome.rewards.lines];
    if (outcome.tour && outcome.tour.coins > 0) all.push({ label: 'First win here', coins: outcome.tour.coins });
    if (outcome.tour?.unlock && outcome.tour.unlock.coins > 0) all.push({ label: 'Spare star card', coins: outcome.tour.unlock.coins });
    if (outcome.ladder?.promoted && outcome.ladder.promoted.reward.coins > 0) all.push({ label: `${outcome.ladder.promoted.name} tier prize`, coins: outcome.ladder.promoted.reward.coins });
    return all;
  });
  const [moments, setMoments] = useState<Moment[]>(() => {
    const list: Moment[] = [];
    if (outcome.tour?.unlock) list.push({ kind: 'player', gain: outcome.tour.unlock });
    if (outcome.ladder?.promoted) list.push({ kind: 'tier', tier: outcome.ladder.promoted });
    return list;
  });
  const [shown, setShown] = useState(0);
  const [burst, setBurst] = useState(0);
  const [starsLit, setStarsLit] = useState(0);
  /** where the scoreboard is, for the win burst to go off around it */
  const [board, setBoard] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const measureBoard = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== board.width || Math.round(y) !== board.top) setBoard({ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) });
  };
  const [momentsOn, setMomentsOn] = useState(false);
  /** the ladder's points have started counting, and the lamps its bar has lit so far */
  const [ladderOn, setLadderOn] = useState(false);
  const [then] = useState(() => afterCoins(outcome));
  const [ladderLit, setLadderLit] = useState(then.ladder?.from ?? 0);
  /** the prizes under the coins that have popped in */
  const [prizesIn, setPrizesIn] = useState(0);
  /** every line is in and counted: the yellow button starts to breathe */
  const [settled, setSettled] = useState(false);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  /** how tall the list and one of its lines are */
  const room = useRef({ list: 0, line: 0 });
  const earnedStars = outcome.tour?.stars ?? 0;

  // a long game earns more lines than fit: follow the newest one down, like a till receipt
  useEffect(() => {
    const y = shown * room.current.line - room.current.list;
    if (y > 0) list.current?.scrollTo({ y, animated: false });
  }, [shown]);

  // with two people somebody always won, so the win is always celebrated
  const cheer = summary.won || summary.mode === 'duo';
  useEffect(() => {
    setMusic(null);
    playSfx(cheer ? 'win' : 'lose');
    if (cheer) {
      after(200, () => {
        setBurst(1);
        playSfx('cheer');
      });
    }
    // the stars come on one by one, each a beat after the last
    for (let i = 0; i < earnedStars; i++) after(STARS_START + i * STAR_MS, () => setStarsLit(i + 1));
    lines.forEach((_, i) =>
      after(LINES_START + i * LINE_MS, () => {
        setShown(i + 1);
        playSfx('coin');
      }),
    );
    const done = LINES_START + lines.length * LINE_MS;
    after(done + 150, () => playSfx('coins'));
    // then the ladder points count up and its bar fills a lamp at a time, each with a tick
    let next = done + 300;
    if (then.ladder) {
      const { from: start, to: target } = then.ladder;
      const steps = Math.abs(target - start);
      after(next, () => setLadderOn(true));
      for (let k = 1; k <= steps; k++) {
        after(next + (k * LADDER_MS) / (steps + 1), () => {
          setLadderLit(start + Math.sign(target - start) * k);
          playSfx('lampTick', 0.5 + (0.5 * k) / steps);
        });
      }
      next += LADDER_MS + 100;
    }
    // then the prizes pop in one after another
    for (let i = 0; i < then.prizes; i++) {
      after(next + i * PRIZE_MS, () => {
        setPrizesIn(i + 1);
        playSfx('star', 0.8);
      });
    }
    next += then.prizes * PRIZE_MS;
    after(next, () => setSettled(true));
    after(next + 200, () => setMomentsOn(true));
    after(Math.max(2600, next + 300), () => setMusic('menu'));
  }, [after, lines, cheer, earnedStars, then]);

  const landed = lines.slice(0, shown).reduce((a, l) => a + l.coins, 0);
  const total = useCountUp(landed, LINE_MS);
  const shownPoints = useCountUp(ladderOn && outcome.ladder ? outcome.ladder.after - outcome.ladder.before : 0, LADDER_MS);
  // the bank in the corner fills up as each line lands, instead of showing the answer before the sum
  const owed = lines.reduce((a, l) => a + l.coins, 0) - landed;
  const mvp = summary.players.find((p) => p.id === summary.mvp) ?? summary.players[0];
  const mvpDef = mustPlayer(mvp.id);
  const away = teamById(setup.away.kitTeam);
  const duo = summary.mode === 'duo';
  const packIds = Object.keys(packs).filter((id) => packs[id] > 0);
  // today's free pack counts as one waiting to open: it is collected in the shop, where it sits first
  const freePack = freePackDay !== dayKey();
  const packCount = packIds.reduce((a, id) => a + packs[id], 0) + (freePack ? 1 : 0);
  const tour = setup.mode === 'tour' && setup.tour ? tourById(setup.tour.tourId, homeTeam) : null;
  const nextStop = tour !== null && summary.won ? nextTourGame(tourProgress, tour) : null;
  const go = goNext(setup, summary.won, tour, nextStop);
  const tp = outcome.ladder ? tierProgress(outcome.ladder.after) : null;
  const ladderGain = outcome.ladder ? outcome.ladder.after - outcome.ladder.before : 0;
  const wonPacks = packsWon(outcome);
  const unlock = outcome.tour?.unlock;
  const hasPrizes = wonPacks.length > 0 || outcome.missionsDone.length > 0 || unlock !== undefined;

  const again = () => {
    if (startNext()) router.replace('/versus');
    else router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <ArcadeScreen title={headline(summary)} tube={cheer ? 'gold' : 'cyan'} back={false} music={false} coins={Math.max(0, bank - owed)} style={styles.body}>
        <View style={styles.row}>
          {/* the win burst goes off behind everything on the page, from the scoreboard's edges outward, so it frames
              the score and never crosses it; it stays below the top bar and above the buttons */}
          <View pointerEvents="none" style={styles.burstRoom}>
            {board.width > 0 && (
              <View style={[styles.burstBox, board]}>
                <Sparks burst={burst} around count={40} reach={150} />
              </View>
            )}
          </View>
          <View style={styles.left}>
            <Arrive onLayout={measureBoard}>
              <Well style={styles.board}>
                <ScoreSide name={duo ? `P1 · ${summary.names[0]}` : summary.names[0]} score={summary.score[0]} lit={duo ? duoWinner(summary) === 0 : summary.won} />
                <View style={styles.dash} />
                <ScoreSide name={duo ? `P2 · ${summary.names[1]}` : summary.names[1]} score={summary.score[1]} lit={duo ? duoWinner(summary) === 1 : !summary.won} mark={<TeamMark team={away} small />} />
              </Well>
            </Arrive>
            {summary.overtime && <Tag label="OVERTIME" tube="red" small style={styles.centerSelf} />}

            <Arrive delay={140} style={styles.centerSelf}>
              <Plate tube="gold" style={styles.mvp}>
                <Face id={mvp.id} size={px(40)} />
                <View style={styles.shrink}>
                  <View style={styles.mvpName}>
                    <Tag label="MVP" tube="gold" small />
                    <Print face="display" size="body" color="text" lines={1}>
                      {mvpDef.name}
                    </Print>
                  </View>
                  <Print face="bold" size="tiny" color="textDim" track="normal" lines={1}>
                    {statLine(mvp)}
                  </Print>
                </View>
              </Plate>
            </Arrive>

            {outcome.tour && (
              <View style={styles.extra}>
                <View accessible accessibilityLabel={`${earnedStars} of 3 stars`} style={styles.stars}>
                  {[0, 1, 2].map((i) => (
                    <View key={i}>
                      <Star lit={false} size={STAR} />
                      {i < starsLit && (
                        <Arrive style={StyleSheet.absoluteFill}>
                          <Star lit size={STAR} />
                        </Arrive>
                      )}
                    </View>
                  ))}
                </View>
                {summary.won && outcome.tour.stars < 3 && <Print face="medium" size="small" color="textDim">{`Win by ${outcome.tour.stars === 1 ? 5 : 10} or more for ${outcome.tour.stars + 1} stars`}</Print>}
                {!summary.won && (
                  <Print face="medium" size="small" color="textDim">
                    Win to earn stars
                  </Print>
                )}
              </View>
            )}
            {tp && (
              <Arrive delay={220} style={styles.extra}>
                <View style={styles.ladderHead}>
                  <TierMedal index={tp.index} size={px(30)} />
                  <Glow face="sign" size="large" tube={tierTube(tp.index)} track="wide">
                    {tp.tier.name.toUpperCase()}
                  </Glow>
                  <Bump beat={ladderOn ? 1 : 0} amount={0.18}>
                    <Tag label={`${ladderGain >= 0 ? '+' : ''}${shownPoints} POINTS`} tube={ladderGain > 0 ? 'green' : 'steel'} small />
                  </Bump>
                </View>
                {tp.next && <SegBar lit={ladderLit} tube={tierTube(tp.index + 1)} small style={styles.ladderBar} />}
              </Arrive>
            )}
          </View>

          <Arrive delay={80} from="right" style={styles.right}>
            <NeonPanel tube="gold" style={styles.panel}>
              <SignHead title="COINS" tube="gold" />
              <ScrollView
                ref={list}
                style={styles.lines}
                showsVerticalScrollIndicator={false}
                onLayout={(e) => {
                  room.current.list = e.nativeEvent.layout.height;
                }}>
                {lines.map((l, i) => {
                  const line = (
                    <>
                      <Print face="medium" size="small" color="textSoft" lines={1} style={styles.shrink}>
                        {l.label}
                      </Print>
                      <Leader />
                      <CoinAmount coins={l.coins} size="small" plus plain />
                    </>
                  );
                  return (
                    <View
                      key={i}
                      onLayout={
                        i === 0
                          ? (e) => {
                              room.current.line = e.nativeEvent.layout.height;
                            }
                          : undefined
                      }>
                      {/* each line slides in as it lands; until then it keeps its place in the list, unseen */}
                      {i < shown ? (
                        <Arrive from="left" style={styles.line}>
                          {line}
                        </Arrive>
                      ) : (
                        <View style={[styles.line, styles.hidden]}>{line}</View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.total}>
                <Print face="display" size="body" color={tubes.gold.tint} track="wide">
                  TOTAL
                </Print>
                <Bump beat={shown} amount={0.14}>
                  <CoinAmount coins={total} size="large" plus />
                </Bump>
              </View>
              {hasPrizes && (
                <View style={styles.prizes}>
                  {unlock && (
                    <PrizeIn shown={prizesIn > 0}>
                      <Chip small>
                        <Face id={unlock.playerId} size={px(24)} />
                        <Print face="bold" size="small" color="text" lines={1}>
                          {mustPlayer(unlock.playerId).name}
                        </Print>
                        <Print face="display" size="small" color={tubes.gold.tint}>
                          {String(playerOverall(mustPlayer(unlock.playerId), Math.max(1, levelOf(owned[unlock.playerId] ?? 1))))}
                        </Print>
                      </Chip>
                    </PrizeIn>
                  )}
                  {wonPacks.map((id, i) => (
                    <PrizeIn key={`${id}${i}`} shown={prizesIn > i + (unlock ? 1 : 0)}>
                      <Chip small>
                        <PackPrize packId={id} width={px(16)} />
                      </Chip>
                    </PrizeIn>
                  ))}
                  {outcome.missionsDone.map((m, i) => (
                    <PrizeIn key={i} shown={prizesIn > i + wonPacks.length + (unlock ? 1 : 0)} style={styles.missionIn}>
                      <Chip small style={styles.mission}>
                        <LineIcon name="check" size={px(14)} tube="green" weight={3} />
                        <Print face="bold" size="tiny" color={tubes.green.tint} lines={1} style={styles.shrink}>{`Mission done: ${m.text}`}</Print>
                      </Chip>
                    </PrizeIn>
                  ))}
                </View>
              )}
            </NeonPanel>
          </Arrive>
        </View>

        {/* the way home in the left corner, the next game under the coins, all the same height; packs to open (or the squad) in between */}
        <Arrive delay={DECK_AT} from="up" style={styles.deck}>
          <View style={styles.deckLeft}>
            <KeyButton label="HOME" icon="home" tube="cyan" sound="back" onPress={() => router.dismissTo('/')} />
            {packCount > 0 && (
              <GhostButton
                tall
                label={packCount > 1 ? 'OPEN PACKS' : 'OPEN PACK'}
                art={<FoilPack pack={packById(packIds[0] ?? 'playground')} width={px(24)} />}
                badge={packCount}
                tube="pink"
                accessibilityLabel={`Open ${packCount === 1 ? 'your pack' : `your ${packCount} packs`}`}
                onPress={() => (packIds.length > 0 ? router.push({ pathname: '/open', params: { pack: packIds[0] } }) : router.push({ pathname: '/packs', params: { tab: 'packs' } }))}
                style={styles.grow}
              />
            )}
            {/* nothing to open: the squad instead, to change players before the next game (back comes here again) */}
            {packCount === 0 && <GhostButton tall label="MY SQUAD" icon="squad" tube="violet" onPress={() => router.push('/squad')} style={styles.grow} />}
          </View>
          <View style={styles.deckRight}>
            {/* light that swells and fades behind it, "this one next", without moving its edges out of line */}
            <Breathe on={settled} depth={0.85} ms={900} pointerEvents="none" style={styles.nextGlow}>
              <View style={styles.nextGlowFill} />
            </Breathe>
            <GoldButton label={go.label} sub={go.sub} icon={go.icon} onPress={again} accessibilityLabel={`${go.label}. ${go.sub}`} />
          </View>
        </Arrive>
      </ArcadeScreen>
      {momentsOn && moments.length > 0 && <MomentOverlay key={moments.length} moment={moments[0]} onClose={() => setMoments((m) => m.slice(1))} />}
    </View>
  );
}

/** A prize that pops in when its turn comes, keeping its place until then so nothing around it moves. */
function PrizeIn({ shown, children, style }: { shown: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return shown ? <Arrive style={style}>{children}</Arrive> : <View style={[style, styles.hidden]}>{children}</View>;
}

const LEADER_H = Math.max(2, Math.round(arcade.hairline));
const LEADER_DOTS = `${arcade.hairline * 0.1} ${arcade.hairline * 2.6}`;

/**
 * The dotted line from a reward to its coins, as on a receipt. Drawn as round dots on a line, because a dotted
 * border on one side only comes out solid on some rows on an iPhone.
 */
function Leader() {
  return (
    <View style={styles.leader}>
      <Svg width="100%" height={LEADER_H}>
        <Line x1={arcade.hairline} y1={LEADER_H / 2} x2="100%" y2={LEADER_H / 2} stroke={night.lineLit} strokeWidth={arcade.hairline} strokeLinecap="round" strokeDasharray={LEADER_DOTS} />
      </Svg>
    </View>
  );
}

export default function Results() {
  const summary = useSession((s) => s.summary);
  const outcome = useSession((s) => s.outcome);
  const setup = useSession((s) => s.setup);
  if (!summary || !outcome || !setup) return <Redirect href="/" />;
  return <Body key={setup.seed} summary={summary} outcome={outcome} setup={setup} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    paddingTop: space.sm,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  left: {
    flex: 1.1,
    justifyContent: 'center',
    gap: space.sm,
  },
  board: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.lg,
    paddingVertical: px(6),
  },
  scoreSide: {
    alignItems: 'center',
    minWidth: sizes.card,
  },
  scoreName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  // a short lit bar between the two scores, level with the middle of their digits
  dash: {
    width: px(18),
    height: px(6),
    borderRadius: px(3),
    backgroundColor: night.lineLit,
    marginBottom: Math.round((SCORE * neonLeading.display) / 2) - px(3),
  },
  centerSelf: {
    alignSelf: 'center',
  },
  shrink: {
    flexShrink: 1,
  },
  // a name plate grown to hold a face and two lines
  mvp: {
    height: 'auto',
    borderRadius: arcade.rWell,
    gap: space.sm,
    paddingVertical: px(5),
    paddingLeft: px(5),
    paddingRight: space.lg,
  },
  mvpName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  extra: {
    alignItems: 'center',
    gap: px(4),
  },
  stars: {
    flexDirection: 'row',
    gap: px(6),
  },
  ladderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  ladderBar: {
    width: '60%',
  },
  burstRoom: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  burstBox: {
    position: 'absolute',
  },
  right: {
    flex: 1,
    justifyContent: 'center',
  },
  panel: {
    flexShrink: 1,
    maxHeight: '100%',
    paddingHorizontal: px(12),
    paddingTop: px(9),
    paddingBottom: px(10),
    gap: px(6),
  },
  lines: {
    flexGrow: 0,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: px(2),
  },
  leader: {
    flex: 1,
    minWidth: space.sm,
    height: LEADER_H,
  },
  hidden: {
    opacity: 0,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: arcade.hairline,
    borderColor: tubes.gold.glass,
    paddingTop: px(6),
  },
  prizes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    borderTopWidth: arcade.hairline,
    borderColor: night.line,
    paddingTop: px(6),
  },
  missionIn: {
    maxWidth: '100%',
  },
  mission: {
    maxWidth: '100%',
    borderColor: tubes.green.glass,
  },
  // the bottom row keeps the columns above it: its left part under the score, the yellow button under the coins
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    height: DECK_H,
    marginTop: space.md,
    marginBottom: space.xs,
  },
  deckLeft: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  deckRight: {
    flex: 1,
  },
  nextGlow: {
    ...StyleSheet.absoluteFill,
  },
  nextGlowFill: {
    flex: 1,
    borderRadius: arcade.rTile,
    boxShadow: [halo(goldButton.glow, 30, 0.9, 7)],
  },
  grow: {
    flex: 1,
  },
  moment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  momentRays: {
    position: 'absolute',
    left: (MOMENT_CARD - MOMENT_CARD * 2.6) / 2,
    top: (Math.round(MOMENT_CARD * sizes.cardRatio) - MOMENT_CARD * 2.6) / 2,
  },
  momentText: {
    flex: 1,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  tierPanel: {
    alignItems: 'center',
    gap: space.sm,
  },
  tierRays: {
    position: 'absolute',
    left: (px(80) - px(220)) / 2,
    top: (px(80) - px(220)) / 2,
  },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  wide: {
    alignSelf: 'stretch',
  },
});
