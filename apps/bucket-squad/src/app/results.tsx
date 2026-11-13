/** After the final buzzer: the score, the best player, and every coin and prize the game earned. */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { playSfx, setMusic } from '@/audio/sound';
import { mustPlayer, playerOverall, teamById } from '@/data/roster';
import { buzz } from '@/fx/feedback';
import { levelOf, type Gain } from '@/meta/collection';
import { tierProgress, type Tier } from '@/meta/ladder';
import type { MatchSetup, MatchSummary, PlayerLine } from '@/meta/match';
import type { RewardLine } from '@/meta/rewards';
import { nextTourGame, tourById } from '@/meta/tour';
import type { MatchOutcome } from '@/state/logic';
import { startNext } from '@/state/play';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { color, size as sizes, space, stroke } from '@/theme/tokens';
import { Avatar, ProgressBar, Stars, Tag, TeamBadge, useCountUp } from '@/ui/Bits';
import { Confetti } from '@/ui/Confetti';
import { useAfter } from '@/ui/hooks';
import { Icon } from '@/ui/Icon';
import { Overlay, Panel } from '@/ui/Overlay';
import { PlayerCard } from '@/ui/PlayerCard';
import { CoinAmount, PackChip } from '@/ui/Rewards';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

type Moment = { kind: 'player'; gain: Gain } | { kind: 'tier'; tier: Tier };

/** time between reward lines appearing */
const LINE_MS = 240;
const LINES_START = 500;

function statLine(p: PlayerLine): string {
  const parts = [`${p.points} PTS`];
  if (p.rebounds > 0) parts.push(`${p.rebounds} REB`);
  if (p.assists > 0) parts.push(`${p.assists} AST`);
  if (p.steals > 0) parts.push(`${p.steals} STL`);
  if (p.blocks > 0) parts.push(`${p.blocks} BLK`);
  return parts.slice(0, 4).join('  ·  ');
}

function headline(s: MatchSummary): string {
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
      <Overlay>
        <Panel width={sizes.panelMax - 60} face={styles.moment}>
          <PlayerCard player={player} level={Math.max(1, moment.gain.levelAfter)} width={sizes.card + space.md} shine />
          <View style={styles.momentText}>
            <StickerText size="title" color="coral">
              {title}
            </StickerText>
            <Txt font="display" size="large">
              {player.name}
            </Txt>
            <Txt color="inkSoft">{moment.gain.isNew ? `You beat the ${teamById(player.team).name}, so their star joins your Shelf.` : 'You already had this star, so they got stronger.'}</Txt>
            <StickerButton label="AWESOME!" fill="mint" onPress={onClose} />
          </View>
        </Panel>
        <Confetti burst={1} count={40} reach={260} style={styles.momentConfetti} />
      </Overlay>
    );
  }
  const { tier } = moment;
  return (
    <Overlay>
      <Panel width={sizes.panelMax - 140} face={styles.tierPanel}>
        <Icon name="trophy" size={sizes.avatarLarge} color={tier.color} />
        <StickerText size="title" color="sun" center>
          {`${tier.name.toUpperCase()} TIER!`}
        </StickerText>
        <Txt color="inkSoft" center>
          You climbed the Ladder. Here is your prize.
        </Txt>
        <View style={styles.prizeRow}>
          {tier.reward.coins > 0 && <CoinAmount coins={tier.reward.coins} size="large" plus />}
          {tier.reward.pack !== undefined && <PackChip packId={tier.reward.pack} />}
        </View>
        <StickerButton label="LET'S GO!" fill="mint" onPress={onClose} style={styles.wide} />
      </Panel>
      <Confetti burst={1} count={40} reach={260} style={styles.momentConfetti} />
    </Overlay>
  );
}

function Body({ summary, outcome, setup }: { summary: MatchSummary; outcome: MatchOutcome; setup: MatchSetup }) {
  const router = useRouter();
  const after = useAfter();
  const packs = useSave((s) => s.packs);
  const tourProgress = useSave((s) => s.tour);
  const owned = useSave((s) => s.owned);
  const homeTeam = useSave((s) => s.homeTeam);
  const [lines] = useState<RewardLine[]>(() => {
    const all = [...outcome.rewards.lines];
    if (outcome.tour && outcome.tour.coins > 0) all.push({ label: 'First win here', coins: outcome.tour.coins });
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
  const [momentsOn, setMomentsOn] = useState(false);

  useEffect(() => {
    setMusic(null);
    playSfx(summary.won ? 'win' : 'lose');
    if (summary.won) {
      after(200, () => {
        setBurst(1);
        playSfx('cheer');
      });
    }
    lines.forEach((_, i) =>
      after(LINES_START + i * LINE_MS, () => {
        setShown(i + 1);
        playSfx('coin');
      }),
    );
    const done = LINES_START + lines.length * LINE_MS;
    after(done + 150, () => playSfx('coins'));
    after(done + 500, () => setMomentsOn(true));
    after(Math.max(2600, done + 600), () => setMusic('menu'));
  }, [after, lines, summary.won]);

  const total = useCountUp(
    lines.slice(0, shown).reduce((a, l) => a + l.coins, 0),
    LINE_MS,
  );
  const mvp = summary.players.find((p) => p.id === summary.mvp) ?? summary.players[0];
  const mvpDef = mustPlayer(mvp.id);
  const away = teamById(setup.away.kitTeam);
  const packIds = Object.keys(packs).filter((id) => packs[id] > 0);
  const packCount = packIds.reduce((a, id) => a + packs[id], 0);
  const tour = setup.mode === 'tour' && setup.tour ? tourById(setup.tour.tourId, homeTeam) : null;
  const hasNext = tour !== null && summary.won && nextTourGame(tourProgress, tour) !== null;
  const tp = outcome.ladder ? tierProgress(outcome.ladder.after) : null;
  const ladderGain = outcome.ladder ? outcome.ladder.after - outcome.ladder.before : 0;
  const wonPacks: string[] = [];
  if (outcome.tour?.pack) wonPacks.push(outcome.tour.pack);
  if (outcome.tour?.starPack) wonPacks.push(outcome.tour.starPack);
  if (outcome.ladder?.promoted?.reward.pack) wonPacks.push(outcome.ladder.promoted.reward.pack);

  const again = () => {
    if (startNext()) router.replace('/versus');
    else router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <Screen
        back={false}
        music={false}
        tone={summary.won ? 'orange' : 'sky'}
        left={
          <StickerText size="title" color="white">
            {headline(summary)}
          </StickerText>
        }>
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={styles.score}>
              <View style={styles.scoreSide}>
                <Txt font="display" size="small" color="white" shadow lines={1}>
                  {summary.names[0].toUpperCase()}
                </Txt>
                <StickerText size="huge" color={summary.won ? 'sun' : 'white'}>
                  {String(summary.score[0])}
                </StickerText>
              </View>
              <Txt font="display" size="title" color="white" shadow style={styles.dash}>
                -
              </Txt>
              <View style={styles.scoreSide}>
                <View style={styles.awayName}>
                  <TeamBadge team={away} diameter={sizes.badgeTiny} />
                  <Txt font="display" size="small" color="white" shadow lines={1}>
                    {summary.names[1].toUpperCase()}
                  </Txt>
                </View>
                <StickerText size="huge" color={summary.won ? 'white' : 'sun'}>
                  {String(summary.score[1])}
                </StickerText>
              </View>
            </View>
            {summary.overtime && <Tag label="Overtime" fill="coral" textColor="white" style={styles.centerSelf} />}

            <Sticker fill="paper" round="pill" raise="low" style={styles.centerSelf} face={styles.mvp}>
              <Avatar id={mvp.id} diameter={sizes.avatarSmall + space.xs} />
              <View>
                <View style={styles.mvpName}>
                  <Tag label="MVP" fill="sun" icon="star" />
                  <Txt font="display" size="body" lines={1}>
                    {mvpDef.name}
                  </Txt>
                </View>
                <Txt size="small" color="inkSoft" lines={1}>
                  {statLine(mvp)}
                </Txt>
              </View>
            </Sticker>

            {outcome.tour && (
              <View style={styles.extra}>
                <Stars have={outcome.tour.stars} size={sizes.iconLarge} />
                {summary.won && outcome.tour.stars < 3 && (
                  <Txt size="small" color="white" shadow>
                    {`Win by ${outcome.tour.stars === 1 ? 5 : 10} or more for ${outcome.tour.stars + 1} stars`}
                  </Txt>
                )}
                {!summary.won && (
                  <Txt size="small" color="white" shadow>
                    Win to earn stars
                  </Txt>
                )}
              </View>
            )}
            {tp && (
              <View style={styles.extra}>
                <View style={styles.ladderHead}>
                  <Icon name="trophy" size={sizes.icon} color={tp.tier.color} />
                  <Txt font="display" size="body" color="white" shadow>
                    {tp.tier.name}
                  </Txt>
                  <Tag label={`${ladderGain >= 0 ? '+' : ''}${ladderGain} points`} fill={ladderGain > 0 ? 'mint' : 'paperDim'} />
                </View>
                {tp.next && <ProgressBar value={tp.span > 0 ? tp.have / tp.span : 1} fill={tp.next.color} style={styles.ladderBar} />}
              </View>
            )}
          </View>

          <View style={styles.right}>
            <Sticker fill="paper" round="lg" raise="mid" style={styles.panelBox} face={styles.panel}>
              <ScrollView style={styles.lines} showsVerticalScrollIndicator={false}>
                {lines.map((l, i) => (
                  <View key={i} style={[styles.line, i >= shown && styles.hidden]}>
                    <Txt size="small" lines={1} style={styles.lineLabel}>
                      {l.label}
                    </Txt>
                    <Txt font="display" size="small" color="sunDeep">{`+${l.coins}`}</Txt>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.total}>
                <Txt font="display" size="body">
                  COINS
                </Txt>
                <CoinAmount coins={total} size="large" plus />
              </View>
              {(wonPacks.length > 0 || outcome.missionsDone.length > 0 || outcome.tour?.unlock) && (
                <View style={styles.prizes}>
                  {outcome.tour?.unlock && (
                    <View style={styles.prize}>
                      <Avatar id={outcome.tour.unlock.playerId} diameter={sizes.badgeSmall} />
                      <Txt font="display" size="small" lines={1}>
                        {`${mustPlayer(outcome.tour.unlock.playerId).name}  ${playerOverall(mustPlayer(outcome.tour.unlock.playerId), Math.max(1, levelOf(owned[outcome.tour.unlock.playerId] ?? 1)))}`}
                      </Txt>
                    </View>
                  )}
                  {wonPacks.map((id, i) => (
                    <PackChip key={`${id}${i}`} packId={id} width={sizes.badgeTiny} />
                  ))}
                  {outcome.missionsDone.map((m, i) => (
                    <Tag key={i} label={`Mission done: ${m.text}`} fill="mint" icon="check" />
                  ))}
                </View>
              )}
            </Sticker>
          </View>
        </View>

        <View style={styles.buttons}>
          <StickerButton label="HOME" icon="home" iconColor="sky" fill="white" textSize="body" onPress={() => router.dismissTo('/')} style={styles.side} />
          {packCount > 0 && <StickerButton label={`OPEN PACK${packCount > 1 ? `S (${packCount})` : ''}`} icon="pack" iconColor="white" fill="grape" textColor="white" textSize="body" onPress={() => router.push({ pathname: '/open', params: { pack: packIds[0] } })} style={styles.side} />}
          <StickerButton label={hasNext ? 'NEXT GAME' : 'PLAY AGAIN'} icon="play" iconColor="white" fill="mint" raise="high" onPress={again} style={styles.main} />
        </View>

        <Confetti burst={burst} count={44} reach={280} style={styles.confetti} />
      </Screen>
      {momentsOn && moments.length > 0 && <MomentOverlay key={moments.length} moment={moments[0]} onClose={() => setMoments((m) => m.slice(1))} />}
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
  score: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.lg,
  },
  scoreSide: {
    alignItems: 'center',
    minWidth: sizes.card,
  },
  dash: {
    marginBottom: space.xl,
  },
  awayName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  mvp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.lg,
  },
  mvpName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  extra: {
    alignItems: 'center',
    gap: space.hair,
  },
  ladderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  ladderBar: {
    width: '60%',
  },
  right: {
    flex: 1,
    justifyContent: 'center',
  },
  panelBox: {
    maxHeight: '100%',
  },
  panel: {
    flexShrink: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  lines: {
    flexGrow: 0,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  lineLabel: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: stroke.thin,
    borderColor: color.paperDim,
    paddingTop: space.xs,
  },
  prizes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: stroke.thin,
    borderColor: color.paperDim,
    paddingTop: space.xs,
  },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  side: {
    flex: 1,
  },
  main: {
    flex: 1.4,
  },
  confetti: {
    top: '34%',
    left: '27%',
  },
  moment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  momentText: {
    flex: 1,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  momentConfetti: {
    top: '45%',
    left: '50%',
  },
  tierPanel: {
    alignItems: 'center',
    gap: space.sm,
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
