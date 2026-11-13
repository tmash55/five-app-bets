/**
 * Opening a pack. The sealed pack waits on the stage; a tap shakes it and tears it open; each card rises from
 * its place in the row and plays its rarity's own reveal, then glides aside for what it says about the player;
 * then the whole haul.
 *
 * `openPack` is called once, at the tear, and what it returns is what is revealed. Every reveal is a timeline
 * on one clock, so a tap while one is playing jumps it to its end (its payoff sound still plays once), and a
 * tap once it is finished goes on.
 *
 * Development builds only: `/open?pack=allstar&demo=common,rare,epic,legend` plays those reveals with the first
 * player of each rarity, all new, without opening a pack or touching the save. It is how they are filmed.
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { duckMusic, playSfx } from '@/audio/sound';
import { buzz } from '@/fx/feedback';
import { revealFor, type Cue, type Pulse, type Reveal } from '@/fx/reveal';
import { CardInfo, lampPlan } from '@/fx/reveal/CardInfo';
import { openLayout } from '@/fx/reveal/layout';
import { flashAt } from '@/fx/reveal/motion';
import { bestRarity, demoResult, parseDemo, planPack, type CardPlan } from '@/fx/reveal/plan';
import { preloadArt } from '@/fx/reveal/preload';
import { Sealed } from '@/fx/reveal/Sealed';
import { Slots, type SlotState } from '@/fx/reveal/Slots';
import { STAGE_SETS, StageOver, StagePoint, StageRoom, parkStage, useStageValues, type StageRole, type StageValues } from '@/fx/reveal/Stage';
import { Summary } from '@/fx/reveal/Summary';
import { Tear, landings } from '@/fx/reveal/Tear';
import { ARRIVE, GLIDE, INFO, LEAVE, TEAR, tearLength } from '@/fx/reveal/times';
import { packById, type PackDef, type PackResult } from '@/meta/packs';
import { useSave } from '@/state/save';
import { night, rarityPaint, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CoinChip } from '@/ui/arcade/ArcadeScreen';
import { RoundButton } from '@/ui/arcade/Buttons';
import { StageWall } from '@/ui/arcade/Room';
import { Chip } from '@/ui/arcade/Surface';
import { Print } from '@/ui/arcade/Type';
import { useAfter } from '@/ui/hooks';

type Stage = 'sealed' | 'tear' | 'cards' | 'summary';
/** where the card on show is: rising to the middle, being revealed, telling about its player, or done */
type Step = 'arrive' | 'reveal' | 'info' | 'ready';

/** the info side's own clock runs this long: everything on it is in by then */
const INFO_END = 1100;
/** the haul's clock, long enough for five cards to pop in */
const HAUL_END = 2600;
/** haptic ticks while the pack is shaken, closer and closer together */
const RATTLE_TICKS = [210, 390, 530, 640, 730, 805, 865, 915] as const;
/** how far the music steps back while a card is revealed: the better the card, the quieter the room */
const DUCK = { common: 1, rare: 0.7, epic: 0.35, legend: 0.12 } as const;
const NO_PULSES: { shakes: readonly Pulse[]; flashes: readonly Pulse[] } = { shakes: [], flashes: [] };

function safePack(id: string): PackDef | null {
  try {
    return packById(id);
  } catch {
    return null;
  }
}

function fire(cue: Cue): void {
  if (cue.sfx) playSfx(cue.sfx, cue.volume ?? 1);
  if (cue.buzz) buzz(cue.buzz);
}

export default function OpenPack() {
  const params = useLocalSearchParams<{ pack?: string; first?: string; demo?: string }>();
  const packId = params.pack ?? 'playground';
  const first = params.first === '1';
  // a store build ignores the demo entirely
  const demo = useMemo(() => (__DEV__ ? parseDemo(params.demo) : null), [params.demo]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const after = useAfter();
  const def = useMemo(() => safePack(packId), [packId]);
  const count = useSave((s) => s.packs[packId] ?? 0);
  const coins = useSave((s) => s.coins);
  const owned = useSave((s) => s.owned);
  const openPack = useSave((s) => s.openPack);

  const [stage, setStage] = useState<Stage>('sealed');
  const [result, setResult] = useState<PackResult | null>(null);
  const plans = useMemo(() => (result ? planPack(result) : []), [result]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('arrive');
  const [infoFor, setInfoFor] = useState<number | null>(null);
  const [lamps, setLamps] = useState(0);
  const [pips, setPips] = useState(0);
  const [counting, setCounting] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paid, setPaid] = useState(true);
  /** the cards whose reveals are on the stage: the one playing, the next one waiting hidden, and one going back to the row */
  const [mounted, setMounted] = useState<readonly number[]>([]);
  const leavingNow = useRef<number | null>(null);

  /** bumped to call off everything still scheduled */
  const run = useRef(0);
  /** the reveal on show, and which of its cues have played */
  const live = useRef<{ def: Reveal; plan: CardPlan; index: number; fired: Set<Cue> } | null>(null);

  const s0 = useStageValues();
  const s1 = useStageValues();
  const s2 = useStageValues();
  const s3 = useStageValues();
  const sets = useMemo(() => [s0, s1, s2, s3] as const, [s0, s1, s2, s3]);
  const valuesOf = (i: number): StageValues => sets[i % STAGE_SETS];
  /** which set of values the card playing now runs on */
  const liveSet = useSharedValue(0);
  const tearClock = useSharedValue(0);
  const info = useSharedValue(0);
  const infoAlpha = useSharedValue(1);
  const haul = useSharedValue(0);
  const pulses = useSharedValue(NO_PULSES);
  const skipFlash = useSharedValue(0);

  const cardsIn = demo?.length ?? def?.cards ?? 3;
  const lay = useMemo(() => openLayout(width, height, insets, result ? result.cards.length : cardsIn), [width, height, insets, result, cardsIn]);
  const reveals = useMemo(() => plans.map((p) => revealFor(p.rarity, reduced)), [plans, reduced]);

  // the music comes back up whenever the page goes
  useEffect(() => () => duckMusic(1), []);

  /** the clock of the card playing now */
  const c0 = s0.clock;
  const c1 = s1.clock;
  const c2 = s2.clock;
  const c3 = s3.clock;
  const shakeStyle = useAnimatedStyle(() => {
    const k = liveSet.value;
    const t = k === 0 ? c0.value : k === 1 ? c1.value : k === 2 ? c2.value : c3.value;
    let x = 0;
    let y = 0;
    for (const s of pulses.value.shakes) {
      const u = (t - s.at) / s.ms;
      if (u > 0 && u < 1) {
        const a = s.amount * (1 - u) * (1 - u);
        x += a * Math.sin(t * 0.11 + s.at);
        y += a * Math.cos(t * 0.137 + s.at * 0.7);
      }
    }
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  const flashStyle = useAnimatedStyle(() => {
    const k = liveSet.value;
    const t = k === 0 ? c0.value : k === 1 ? c1.value : k === 2 ? c2.value : c3.value;
    let a = skipFlash.value;
    for (const f of pulses.value.flashes) a = Math.max(a, f.amount * flashAt(t, f.at, f.ms));
    return { opacity: a };
  });
  const infoStyle = useAnimatedStyle(() => ({ opacity: infoAlpha.value }));

  const available = demo ? 1 : count;

  const showInfo = (p: CardPlan, i: number, my: number) => {
    setStep('info');
    setInfoFor(i);
    setLamps(0);
    setPips(0);
    setCounting(false);
    duckMusic(1);
    infoAlpha.set(1);
    if (!reduced) valuesOf(i).glide.set(withTiming(1, { duration: GLIDE, easing: Easing.inOut(Easing.cubic) }));
    info.set(0);
    info.set(withTiming(INFO_END, { duration: INFO_END, easing: Easing.linear }));
    const ok = () => run.current === my;
    const lp = lampPlan(p);
    after(INFO.tag, () => {
      if (!ok()) return;
      if (p.gain.coins > 0) playSfx('coins');
      else if (!p.gain.isNew && p.gain.levelAfter > p.gain.levelBefore) playSfx('levelUp');
    });
    after(INFO.sign, () => ok() && playSfx('neonOn', 0.6));
    after(INFO.ovr, () => ok() && setCounting(true));
    for (let k = 1; k <= lp.total; k++) {
      after(INFO.lamps + (k - 1) * INFO.lampGap, () => {
        if (!ok()) return;
        setLamps(k);
        playSfx('lampTick', 0.5 + (0.5 * k) / lp.total);
      });
    }
    const pipsAt = INFO.lamps + lp.total * INFO.lampGap + 60;
    for (let j = 1; j <= p.team.have; j++) {
      after(pipsAt + (j - 1) * INFO.pipGap, () => {
        if (!ok()) return;
        setPips(j);
        playSfx('lampTick');
      });
    }
    after(pipsAt + p.team.have * INFO.pipGap, () => {
      if (!ok()) return;
      setStep('ready');
      prepare(i + 1, plans.length);
    });
  };

  /**
   * Put card `i`'s reveal on the stage ahead of its turn, hidden: built in the background (a tap still answers at
   * once, and the work simply waits), and only switched on when NEXT PLAYER is tapped. Asking twice is harmless.
   * Anything older than the card on show goes in the same pass, unless it is still dropping back into the row.
   */
  const prepare = (i: number, n: number) => {
    if (i >= n) return;
    const keep = leavingNow.current;
    const want = [keep, i - 1, i].filter((k): k is number => k !== null && k >= 0);
    startTransition(() => setMounted([...new Set(want)].sort((a, b) => a - b)));
  };

  const startCard = (list: CardPlan[], i: number) => {
    const p = list[i];
    const r = revealFor(p.rarity, reduced);
    const my = ++run.current;
    const fired = new Set<Cue>();
    live.current = { def: r, plan: p, index: i, fired };
    setIndex(i);
    setStep('arrive');
    // normally already on the stage, hidden and waiting; if the child was quicker than that, it is put there now
    setMounted((m) => (m.includes(i) ? m : [...m, i].sort((a, b) => a - b)));
    pulses.set({ shakes: r.shakes, flashes: r.flashes });
    const { clock } = valuesOf(i);
    parkStage(valuesOf(i), reduced);
    liveSet.set(i % STAGE_SETS);
    // with less motion asked for the reveal is only a fade, and a fade still plays rather than jumping to its end
    clock.set(withTiming(r.length + r.tail, { duration: ARRIVE + r.length + r.tail, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    playSfx('cardDeal', 0.8);
    after(ARRIVE, () => {
      if (run.current !== my) return;
      setStep('reveal');
      duckMusic(DUCK[p.rarity]);
    });
    for (const cue of r.cues) {
      after(ARRIVE + cue.at, () => {
        if (run.current !== my) return;
        fired.add(cue);
        fire(cue);
      });
    }
    after(ARRIVE + r.length, () => run.current === my && showInfo(p, i, my));
    // the next card is put on the stage once this one has turned over and is settling: a quiet moment, before the
    // words come in, so it is ready long before NEXT PLAYER can be tapped (and again once everything is in, if a
    // quick tap went past it)
    after(ARRIVE + Math.min(r.flipAt + 250, r.length), () => run.current === my && prepare(i + 1, list.length));
  };

  /** Jump the reveal on show to its end: everything in place, and its payoff heard once. */
  const skip = () => {
    const s = live.current;
    if (!s) return;
    const my = ++run.current;
    const r = s.def;
    const { clock } = valuesOf(s.index);
    clock.set(r.length);
    clock.set(withTiming(r.length + r.tail, { duration: Math.max(1, r.tail), easing: Easing.linear }));
    skipFlash.set(0.4);
    skipFlash.set(withTiming(0, { duration: 300 }));
    for (const cue of r.cues) {
      if (cue.at >= r.length) {
        after(cue.at - r.length, () => run.current === my && fire(cue));
      } else if (cue.stinger && !s.fired.has(cue)) {
        s.fired.add(cue);
        fire(cue);
      }
    }
    showInfo(s.plan, s.index, my);
    prepare(s.index + 1, plans.length);
  };

  /** Everything on the info side in place at once. */
  const finishInfo = () => {
    const s = live.current;
    if (!s) return;
    ++run.current;
    info.set(INFO_END);
    valuesOf(s.index).glide.set(1);
    setLamps(lampPlan(s.plan).total);
    setPips(s.plan.team.have);
    setCounting(true);
    setStep('ready');
    prepare(s.index + 1, plans.length);
  };

  const toSummary = (res: PackResult) => {
    ++run.current;
    live.current = null;
    pulses.set(NO_PULSES);
    duckMusic(1);
    setStage('summary');
    setMounted([]);
    playSfx('star');
    haul.set(0);
    haul.set(withTiming(HAUL_END, { duration: HAUL_END, easing: Easing.linear }));
    if (res.coins > 0 && !demo) {
      const my = run.current;
      after(900, () => {
        if (run.current !== my) return;
        setPaid(true);
        playSfx('coins');
      });
    }
  };

  /** On to the next card, or to the haul after the last. */
  const advance = () => {
    const s = live.current;
    if (!s || !result) return;
    const i = s.index;
    if (i + 1 >= plans.length) {
      toSummary(result);
      return;
    }
    // the card drops back into its place in the row while what it said fades
    setLeaving(i);
    leavingNow.current = i;
    const { leave } = valuesOf(i);
    leave.set(0);
    leave.set(withTiming(1, { duration: LEAVE, easing: Easing.inOut(Easing.quad) }));
    infoAlpha.set(withTiming(0, { duration: 180 }));
    after(LEAVE, () => {
      if (leavingNow.current === i) leavingNow.current = null;
      setLeaving((l) => (l === i ? null : l));
    });
    after(180, () => setInfoFor((f) => (f === i ? null : f)));
    startCard(plans, i + 1);
  };

  // the button on the words keeps one function, so the words are not drawn again just because the page was
  const advanceNow = useRef(advance);
  useLayoutEffect(() => {
    advanceNow.current = advance;
  });
  const onNext = useCallback(() => advanceNow.current(), []);

  const beginCards = (list: CardPlan[]) => {
    setStage('cards');
    startCard(list, 0);
  };

  const tear = () => {
    if (available <= 0) return;
    const res = demo ? demoResult(demo, owned) : openPack(packId);
    if (!res || res.cards.length === 0) return;
    const list = planPack(res);
    setResult(res);
    setPaid(res.coins === 0 || !!demo);
    setInfoFor(null);
    setLeaving(null);
    leavingNow.current = null;
    setMounted([]);
    // every picture in the pack starts loading now, and the first card's reveal is built while the pack shakes
    preloadArt(list.map((c) => c.player.id));
    prepare(0, list.length);
    const my = ++run.current;
    if (reduced) {
      playSfx('packOpen');
      beginCards(list);
      return;
    }
    setStage('tear');
    const len = tearLength(list.length);
    tearClock.set(0);
    tearClock.set(withTiming(len, { duration: len, easing: Easing.linear }));
    const ok = () => run.current === my;
    playSfx('packRattle');
    buzz('light');
    for (const at of RATTLE_TICKS) after(at, () => ok() && buzz(at > 700 ? 'medium' : 'light'));
    after(TEAR.rip, () => {
      if (!ok()) return;
      playSfx('packOpen');
      buzz('heavy');
    });
    after(TEAR.rip + 80, () => ok() && playSfx('packGlow', 0.9));
    after(TEAR.flash, () => {
      if (!ok()) return;
      playSfx('sparkle', 0.7);
      buzz('success');
    });
    for (let i = 0; i < list.length; i++) after(TEAR.deal + i * TEAR.dealGap, () => ok() && playSfx('cardDeal'));
    after(len, () => ok() && beginCards(list));
  };

  const skipTear = () => {
    if (!result) return;
    ++run.current;
    tearClock.set(tearLength(result.cards.length));
    beginCards(planPack(result));
  };

  const next = () => {
    if (stage === 'sealed') tear();
    else if (stage === 'tear') skipTear();
    else if (stage === 'cards') {
      if (step === 'arrive' || step === 'reveal') skip();
      else if (step === 'info') finishInfo();
      else advance();
    }
  };

  const leavePage = () => {
    if (first) router.replace('/');
    else if (router.canGoBack()) router.back();
    else router.replace('/packs');
  };

  const again = () => {
    ++run.current;
    live.current = null;
    setResult(null);
    setInfoFor(null);
    setLeaving(null);
    leavingNow.current = null;
    setMounted([]);
    setIndex(0);
    setStage('sealed');
  };

  const slotStates: SlotState[] = plans.map((_, i) => {
    if (i === leaving) return 'shown';
    if (i < index) return 'done';
    if (i === index) return step === 'arrive' || step === 'reveal' ? 'current' : 'shown';
    return 'waiting';
  });
  const rarities = plans.map((p) => p.rarity);
  const light = tube[rarityPaint[bestRarity(plans)].tube];
  const shownInfo = infoFor !== null ? plans[infoFor] : undefined;
  const topBar = { top: Math.max(insets.top, px(4)), left: Math.max(insets.left, px(13)), right: Math.max(insets.right, px(18)) };
  const wallAt: readonly [number, number] = stage === 'cards' ? [lay.rest.x / width, lay.rest.y / height] : [0.5, lay.pack.y / height];
  const onStage = (stage === 'tear' || stage === 'cards') && result ? mounted.filter((i) => i < plans.length) : [];
  const roleOf = (i: number): StageRole => (stage === 'cards' && i === index ? 'live' : i === leaving ? 'leaving' : 'hidden');
  const layer = (i: number) => ({ role: roleOf(i), reveal: reveals[i], values: valuesOf(i), lay, reduced });
  // one list, so a card keeps its place in it (and is never built again) when it moves from under the row to over it
  const slotsLayer =
    stage === 'tear' ? (
      <Slots key="slots" lay={lay} rarities={rarities} states={plans.map(() => 'waiting')} landing={{ clock: tearClock, at: landings(plans.length) }} />
    ) : (
      <Slots key="slots" lay={lay} rarities={rarities} states={slotStates} />
    );
  const points = [
    ...onStage.filter((i) => i !== leaving).map((i) => <StagePoint key={i} {...layer(i)} plan={plans[i]} index={i} />),
    slotsLayer,
    ...onStage.filter((i) => i === leaving).map((i) => <StagePoint key={i} {...layer(i)} plan={plans[i]} index={i} />),
  ];

  if (!def) return <Redirect href="/packs" />;
  return (
    <View style={styles.root}>
      {stage !== 'summary' && (
        <>
          {/* everything that only shows, shaken together; the taps go to the stage below it, and only the buttons drawn above that catch their own */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shakeStyle]}>
            <StageWall at={wallAt} />
            {onStage.map((i) => (
              <StageRoom key={i} {...layer(i)} />
            ))}
            {stage === 'tear' && result && <Tear clock={tearClock} def={def} lay={lay} light={light} />}
            {(stage === 'tear' || stage === 'cards') && result && points}
            {onStage.map((i) => (
              <StageOver key={i} {...layer(i)} />
            ))}
            {stage === 'cards' && (
              <>
                <Chip style={[styles.chip, { left: lay.edge.left, top: topBar.top + px(10) }]}>
                  <Print face="bold" size={px(12.5)} color={tube.indigo.soft} track="wide" glow={tube.indigo.glass} lines={1}>
                    {def.name.toUpperCase()}
                  </Print>
                  <Print face="bold" size={px(12.5)} color="textFaint" track="wide" lines={1}>{`PLAYER ${index + 1} OF ${plans.length}`}</Print>
                </Chip>
              </>
            )}
          </Animated.View>
          <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityRole="button" accessibilityLabel={stage === 'sealed' ? 'Open the pack' : 'Next'} />
          {stage === 'sealed' && <Sealed def={def} lay={lay} count={available} onShop={() => router.dismissTo('/packs')} />}
          {stage === 'cards' && shownInfo && infoFor !== null && (
            <Animated.View pointerEvents="box-none" style={[styles.info, { left: lay.info.left, top: lay.info.top, width: lay.info.width, height: lay.info.height }, infoStyle]}>
              <CardInfo key={infoFor} plan={shownInfo} clock={info} lamps={lamps} pips={pips} counting={counting} last={infoFor + 1 >= plans.length} onNext={onNext} width={lay.info.width} />
            </Animated.View>
          )}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
        </>
      )}

      {stage === 'summary' && result && (
        <>
          <StageWall at={wallAt} />
          <Summary clock={haul} plans={plans} lay={lay} first={first} another={demo ? 0 : count} onAgain={again} onDone={leavePage} />
        </>
      )}

      {(stage === 'sealed' || stage === 'summary') && (
        <View pointerEvents="box-none" style={[styles.top, topBar]}>
          {stage === 'sealed' && !first ? <RoundButton icon="close" label="Back" tube="cyan" sound="back" onPress={leavePage} /> : <View />}
          <CoinChip coins={stage === 'summary' && result && !paid ? coins - result.coins : coins} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: night.stageEdge,
  },
  info: {
    position: 'absolute',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
  },
  flash: {
    backgroundColor: night.white,
  },
  top: {
    position: 'absolute',
    height: px(48),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
