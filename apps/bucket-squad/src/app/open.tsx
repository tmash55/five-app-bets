/** Opening a pack: shake it, tear it, flip the cards one at a time, then see the haul. */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { playSfx, type SfxName } from '@/audio/sound';
import { mustPlayer, playerOverall, teamById } from '@/data/roster';
import type { Rarity } from '@/data/types';
import { buzz } from '@/fx/feedback';
import { levelProgress, type Gain } from '@/meta/collection';
import { packById, type PackDef, type PackResult } from '@/meta/packs';
import { useSave } from '@/state/save';
import { color, duration, layer, opacity, size as sizes, space, type ColorName } from '@/theme/tokens';
import { CoinPill, ProgressBar, RARITY_COLOR, RarityTag, Tag, TeamBadge } from '@/ui/Bits';
import { Confetti } from '@/ui/Confetti';
import { useAfter } from '@/ui/hooks';
import { Icon } from '@/ui/Icon';
import { PACK_RATIO, PackArt } from '@/ui/PackArt';
import { PlayerCard } from '@/ui/PlayerCard';
import { Backdrop, Sunburst } from '@/ui/Screen';
import { IconButton, Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

type Stage = 'sealed' | 'cards' | 'summary';

/** how long a face-down card keeps you guessing */
const TEASE: Record<Rarity, number> = { common: 260, rare: 520, epic: 820, legend: 1150 };
const REVEAL: Record<Rarity, SfxName> = { common: 'revealCommon', rare: 'revealRare', epic: 'revealEpic', legend: 'revealLegend' };
const RAYS = 12;

function safePack(id: string): PackDef | null {
  try {
    return packById(id);
  } catch {
    return null;
  }
}

/** Rays all the way round, turning slowly behind a revealed card. */
function RayBurst({ size, tint, strong }: { size: number; tint: string; strong: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1));
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const d = useMemo(() => {
    let out = '';
    for (let i = 0; i < RAYS; i++) {
      const a0 = (i / RAYS) * Math.PI * 2;
      const a1 = a0 + Math.PI / RAYS;
      out += `M50 50 L${(50 + Math.cos(a0) * 50).toFixed(1)} ${(50 + Math.sin(a0) * 50).toFixed(1)} L${(50 + Math.cos(a1) * 50).toFixed(1)} ${(50 + Math.sin(a1) * 50).toFixed(1)} Z `;
    }
    return out;
  }, []);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d={d} fill={tint} opacity={strong ? opacity.dim : opacity.ghost} />
      </Svg>
    </Animated.View>
  );
}

function CardBack({ width, edge }: { width: number; edge: ColorName }) {
  const height = Math.round(width * sizes.cardRatio);
  return (
    <Sticker fill="inkSoft" edge={edge} round="lg" raise="mid" face={[styles.back, { width, height }]}>
      <Sunburst strength={opacity.pattern} />
      <View style={styles.backBall}>
        <Icon name="ball" size={Math.round(width * 0.42)} color="orange" />
      </View>
    </Sticker>
  );
}

function gainLabel(g: Gain): { text: string; fill: ColorName } {
  if (g.isNew) return { text: 'NEW PLAYER!', fill: 'coral' };
  if (g.coins > 0) return { text: `TOP LEVEL  +${g.coins}`, fill: 'sun' };
  if (g.levelAfter > g.levelBefore) return { text: `LEVEL UP!  LV ${g.levelAfter}`, fill: 'mint' };
  return { text: 'EXTRA COPY', fill: 'skyLight' };
}

function GainInfo({ gain, copies }: { gain: Gain; copies: number }) {
  const player = mustPlayer(gain.playerId);
  const team = teamById(player.team);
  const label = gainLabel(gain);
  const prog = levelProgress(copies);
  return (
    <View style={styles.info}>
      <Tag label={label.text} fill={label.fill} />
      <StickerText size="title" color="white">
        {player.name}
      </StickerText>
      <View style={styles.infoRow}>
        <TeamBadge team={team} diameter={sizes.badgeSmall} />
        <Txt font="display" size="body" color="white" shadow>
          {`${team.name}  ·  ${player.role}`}
        </Txt>
      </View>
      <View style={styles.infoRow}>
        <RarityTag rarity={player.rarity} />
        <Tag label={`${playerOverall(player, prog.level)} OVR`} fill="paper" />
        <Tag label={`LV ${prog.level}`} fill="paper" />
      </View>
      {!prog.maxed && (
        <View style={styles.level}>
          <ProgressBar value={prog.have / prog.need} fill={RARITY_COLOR[player.rarity].fill} height={sizes.barThick} />
          <Txt size="small" color="white" shadow>
            {`${prog.need - prog.have} more ${prog.need - prog.have === 1 ? 'copy' : 'copies'} to reach Level ${prog.level + 1}`}
          </Txt>
        </View>
      )}
      {gain.coins > 0 && (
        <View style={styles.infoRow}>
          <Icon name="coin" color="sun" />
          <Txt font="display" size="large" color="white" shadow>
            {`+${gain.coins} coins`}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** the widest the pack and its cards get, on a screen with room to spare */
const BIGGEST = Math.round(sizes.cardLarge * 1.25);

export default function OpenPack() {
  const params = useLocalSearchParams<{ pack?: string; first?: string }>();
  const packId = params.pack ?? 'playground';
  const first = params.first === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const after = useAfter();
  const def = useMemo(() => safePack(packId), [packId]);
  const count = useSave((s) => s.packs[packId] ?? 0);
  const coins = useSave((s) => s.coins);
  const owned = useSave((s) => s.owned);
  const openPack = useSave((s) => s.openPack);

  const [stage, setStage] = useState<Stage>('sealed');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PackResult | null>(null);
  const [index, setIndex] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [burst, setBurst] = useState(0);

  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const pop = useSharedValue(1);
  const turn = useSharedValue(1);
  const glow = useSharedValue(0);
  const hint = useSharedValue(0);

  useEffect(() => {
    bob.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    hint.set(withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [bob, hint]);

  const packStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (bob.value - 0.5) * 10 }, { rotate: `${(bob.value - 0.5) * 5 + shake.value * 9}deg` }, { scale: 1 + Math.abs(shake.value) * 0.06 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { scaleX: Math.max(0.02, turn.value) }, { rotate: `${(1 - glow.value) * -4}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.6 + glow.value * 0.4 }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: 0.55 + hint.value * 0.45, transform: [{ scale: 1 + hint.value * 0.05 }] }));

  if (!def) return <Redirect href="/packs" />;

  const showCard = (res: PackResult, i: number) => {
    const gain = res.cards[i];
    const rarity = mustPlayer(gain.playerId).rarity;
    setIndex(i);
    setFaceUp(false);
    turn.set(1);
    pop.set(0.4);
    pop.set(withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 }));
    glow.set(0);
    glow.set(withTiming(1, { duration: TEASE[rarity], easing: Easing.out(Easing.quad) }));
    playSfx('cardFlip');
    after(TEASE[rarity], () => {
      turn.set(withSequence(withTiming(0, { duration: duration.quick }), withTiming(1, { duration: duration.normal, easing: Easing.out(Easing.back(2)) })));
      after(duration.quick, () => {
        setFaceUp(true);
        playSfx(REVEAL[rarity]);
        buzz(rarity === 'legend' || rarity === 'epic' ? 'success' : rarity === 'rare' ? 'medium' : 'light');
        if (rarity === 'legend' || rarity === 'epic') setBurst((b) => b + 1);
        if (!gain.isNew && gain.levelAfter > gain.levelBefore) after(duration.slow, () => playSfx('levelUp'));
        if (gain.coins > 0) after(duration.slow, () => playSfx('coins'));
      });
    });
  };

  const tear = () => {
    if (busy || count <= 0) return;
    const res = openPack(packId);
    if (!res) return;
    setBusy(true);
    setResult(res);
    playSfx('packShake');
    buzz('medium');
    shake.set(withSequence(withTiming(1, { duration: 70 }), withRepeat(withSequence(withTiming(-1, { duration: 80 }), withTiming(1, { duration: 80 })), 3), withTiming(0, { duration: 70 })));
    after(620, () => {
      playSfx('packOpen');
      buzz('heavy');
      flash.set(withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: duration.slow })));
      setStage('cards');
      setBusy(false);
      showCard(res, 0);
    });
  };

  const next = () => {
    if (stage === 'sealed') {
      tear();
    } else if (stage === 'cards' && result && faceUp) {
      if (index + 1 < result.cards.length) {
        showCard(result, index + 1);
      } else {
        playSfx('star');
        setStage('summary');
      }
    }
  };

  const leave = () => {
    if (first) router.replace('/');
    else if (router.canGoBack()) router.back();
    else router.replace('/packs');
  };

  const again = () => {
    setResult(null);
    setFaceUp(false);
    setStage('sealed');
  };

  const packW = Math.min(BIGGEST, Math.round((height * 0.56) / PACK_RATIO));
  const cardW = Math.min(BIGGEST, Math.round((height * 0.6) / sizes.cardRatio));
  const gain = result && stage === 'cards' ? result.cards[index] : null;
  const gainPlayer = gain ? mustPlayer(gain.playerId) : null;
  const rc = gainPlayer ? RARITY_COLOR[gainPlayer.rarity] : null;
  const padX = Math.max(insets.left, insets.right, space.lg);
  const summaryW = result ? Math.min(sizes.card + space.lg, Math.floor((width - padX * 2 - space.md * (result.cards.length - 1)) / result.cards.length)) : sizes.card;

  return (
    <View style={styles.root}>
      <Backdrop tone="grape" />
      {stage !== 'summary' && (
        <Pressable style={styles.stage} onPress={next} accessibilityRole="button" accessibilityLabel={stage === 'sealed' ? 'Open the pack' : 'Next'}>
          {stage === 'sealed' && (
            <View style={styles.center}>
              <Txt font="display" size="large" color="white" shadow>
                {count > 0 || busy ? def.name.toUpperCase() : 'NO PACKS LEFT'}
              </Txt>
              <Animated.View style={packStyle}>
                <PackArt pack={def} width={packW} />
                {count > 1 && !busy && <Tag label={`x${count}`} fill="coral" textColor="white" style={styles.count} />}
              </Animated.View>
              {/* kept in place while the pack tears so nothing jumps */}
              <View style={count > 0 && !busy ? null : styles.unseen}>
                <Animated.View style={hintStyle}>
                  <StickerText size="title" color="sun">
                    TAP TO OPEN!
                  </StickerText>
                </Animated.View>
              </View>
            </View>
          )}

          {stage === 'cards' && gain && gainPlayer && rc && result && (
            <View style={[styles.reveal, { paddingHorizontal: padX }]}>
              <View style={[styles.cardSpot, { width: cardW + space.huge, height: Math.round(cardW * sizes.cardRatio) + space.xl }]}>
                <Animated.View pointerEvents="none" style={[styles.burst, glowStyle]}>
                  <RayBurst size={cardW * 2.5} tint={color[rc.fill]} strong={faceUp} />
                </Animated.View>
                <Animated.View style={cardStyle}>
                  {faceUp ? (
                    <PlayerCard player={gainPlayer} level={levelProgress(result.owned[gain.playerId] ?? 1).level} width={cardW} shine={gainPlayer.rarity === 'legend' || gainPlayer.rarity === 'epic'} />
                  ) : (
                    <CardBack width={cardW} edge={gainPlayer.rarity === 'common' ? 'ink' : rc.deep} />
                  )}
                </Animated.View>
                <Confetti burst={burst} />
              </View>
              <View style={styles.side}>
                {faceUp ? (
                  <GainInfo gain={gain} copies={result.owned[gain.playerId] ?? 1} />
                ) : (
                  <StickerText size="big" color={gainPlayer.rarity === 'common' ? 'white' : rc.fill}>
                    ???
                  </StickerText>
                )}
                <View style={styles.dots}>
                  {result.cards.map((c, i) => {
                    const shown = i < index || (i === index && faceUp);
                    return <View key={i} style={[styles.dot, shown ? { backgroundColor: color[RARITY_COLOR[mustPlayer(c.playerId).rarity].fill], borderColor: color.white } : null, i === index ? styles.dotNow : null]} />;
                  })}
                  {faceUp && (
                    <Animated.View style={hintStyle}>
                      <Txt font="display" size="body" color="white" shadow>
                        {index + 1 < result.cards.length ? 'TAP FOR THE NEXT CARD' : 'TAP TO FINISH'}
                      </Txt>
                    </Animated.View>
                  )}
                </View>
              </View>
            </View>
          )}
        </Pressable>
      )}

      {stage === 'summary' && result && (
        <View style={[styles.center, { paddingHorizontal: padX }]}>
          <StickerText size="title" color="sun">
            {first ? 'YOUR FIRST PLAYERS!' : 'NICE PULLS!'}
          </StickerText>
          <View style={styles.haul}>
            {result.cards.map((g, i) => {
              const label = gainLabel(g);
              return (
                <View key={i} style={styles.haulItem}>
                  <PlayerCard player={mustPlayer(g.playerId)} level={levelProgress(owned[g.playerId] ?? 1).level} width={summaryW} />
                  <Tag label={label.text} fill={label.fill} style={styles.haulTag} />
                </View>
              );
            })}
          </View>
          <View style={styles.buttons}>
            {count > 0 && !first && <StickerButton label={`OPEN ANOTHER (${count})`} icon="pack" iconColor="mint" fill="white" onPress={again} textSize="body" />}
            <StickerButton label={first ? "LET'S PLAY!" : 'DONE'} fill="mint" onPress={leave} style={styles.done} />
          </View>
        </View>
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />

      <View pointerEvents="box-none" style={[styles.top, { top: Math.max(insets.top, space.sm), left: Math.max(insets.left, space.lg), right: Math.max(insets.right, space.lg) }]}>
        {stage === 'sealed' && !first && !busy ? <IconButton name="back" label="Back" onPress={leave} /> : <View />}
        <CoinPill coins={coins} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.grapeDeep,
  },
  stage: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  count: {
    position: 'absolute',
    top: space.xs,
    right: -space.sm,
  },
  reveal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },
  cardSpot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBall: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: {
    width: sizes.panelMax / 2 + space.xl,
    gap: space.md,
    justifyContent: 'center',
  },
  info: {
    gap: space.sm,
    alignItems: 'flex-start',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  level: {
    alignSelf: 'stretch',
    gap: space.xs,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: space.xl,
  },
  dot: {
    width: space.md,
    height: space.md,
    borderRadius: space.md / 2,
    borderWidth: space.hair,
    borderColor: color.ink,
    backgroundColor: color.scrimSoft,
  },
  unseen: {
    opacity: 0,
  },
  dotNow: {
    transform: [{ scale: 1.3 }],
  },
  haul: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  haulItem: {
    alignItems: 'center',
    gap: space.xs,
  },
  haulTag: {
    alignSelf: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-end',
  },
  done: {
    minWidth: sizes.cardLarge,
  },
  flash: {
    backgroundColor: color.white,
    zIndex: layer.overlay,
  },
  top: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: layer.overlay,
  },
});

