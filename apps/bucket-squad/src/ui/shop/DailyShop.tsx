/**
 * The Daily Shop: the countdown to midnight, today's LIMITED item and three deals as big cards, and the pop-up
 * that sells one. A child who cannot read follows it by pictures: the coin and price on every card, a red SOLD stamp,
 * a NEW! tag on a player they do not have, a crown when a player is already at the top level, and a ticking clock.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { mustPlayer, teamById } from '@/data/roster';
import { RARITY_LABEL } from '@/data/types';
import { uniformById, type UniformDef } from '@/data/uniforms';
import { tapFeedback } from '@/fx/feedback';
import { MAX_COPIES, levelOf, levelProgress, type Gain } from '@/meta/collection';
import type { PlayerDef } from '@/data/types';
import { dayKey } from '@/meta/rng';
import { MONTH_NAMES, clock, msToMidnight, shortBy, shortClock, type ShopSlot } from '@/meta/shop';
import type { slotBlock } from '@/state/logic';
import { RIM_STOPS, arcade, fade, halo, inner, neonText, night, rarityPaint, track, tube, type Tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { GhostButton, GoldButton, RoundButton } from '@/ui/arcade/Buttons';
import { ArcadeCard, Gems } from '@/ui/arcade/Card';
import { fitText } from '@/ui/arcade/fitText';
import { JERSEY_FULL_RATIO, Jersey } from '@/ui/arcade/Jersey';
import { CopyMeter, useCopyBeat } from '@/ui/arcade/LevelBeat';
import { copyLine } from '@/ui/arcade/levels';
import { Coin, LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL, widthOf } from '@/ui/arcade/measure';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { Popup } from '@/ui/arcade/Popup';
import { Bloom, Rays, StageRing } from '@/ui/arcade/Room';
import { Pips } from '@/ui/arcade/SegBar';
import { Sparks } from '@/ui/arcade/Sparks';
import { Chip, Tag } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';
import { useAfter } from '@/ui/hooks';

export type SlotBlock = ReturnType<typeof slotBlock>;

/** the LIMITED slot's own light: gold, with a foil rim that runs through the Legend colours */
const LIMITED_TUBE = tube.gold;
const LIMITED_RIM = rarityPaint.legend.rim;
/** the LIMITED card is this much wider than a deal */
const LIMITED_WEIGHT = 1.32;
/** between two cards */
const GAP = px(10);
/** inside a card: its padding, the ribbon along its top, the price along its foot, and the gaps between them */
const CARD_PAD = px(8);
const RIBBON = px(22);
const FOOT = sizes.tap;
const INNER_GAP = px(6);
/** above a card in a slot: the room its NEW! tag reaches up into, clear of the ribbon */
const TAG_ROOM = px(10);
/** the foil rim round the LIMITED card */
const RIM = px(3);
/** the name under a uniform on its card */
const UNIFORM_NAME = px(20);
/** the countdown's figures get the width the widest time takes, so the chip does not twitch as they change */
const CLOCK_SIZE = neonText.large;
const CLOCK_W = Math.ceil(widthOf('00:00:00', 'display', CLOCK_SIZE, track.normal) * 1.04);
/** the pop-up's big card and jersey */
const BIG_CARD = px(150);
const BIG_JERSEY = px(112);
/** the pop-up's words */
const WORDS = px(300);

/** The tube a slot is lit in: gold for LIMITED, the rarity's own for a deal. */
export function slotTube(slot: ShopSlot): Tube {
  if (slot.limited) return LIMITED_TUBE;
  return tube[rarityPaint[mustPlayer(slot.item.id).rarity].tube];
}

function slotUniform(slot: ShopSlot): UniformDef | undefined {
  return slot.item.kind === 'uniform' ? uniformById(slot.item.id) : undefined;
}

/** The LIMITED tag's word: the holiday's name for a holiday uniform ("HALLOWEEN"). */
function limitedLabel(slot: ShopSlot): string {
  return slotUniform(slot)?.holiday?.toUpperCase() ?? 'LIMITED';
}

function slotName(slot: ShopSlot): string {
  return slot.item.kind === 'uniform' ? (uniformById(slot.item.id)?.name ?? '') : mustPlayer(slot.item.id).name;
}

/**
 * The day the shop is showing, and the handler that moves it on at midnight. In development `?day=2026-11-14` shows
 * another day's shop, for screenshots.
 */
export function useShopDay(override?: string): [string, (now: number) => void] {
  const [day, setDay] = useState(() => dayKey());
  const onTick = useCallback((now: number) => {
    const next = dayKey(new Date(now));
    setDay((d) => (d === next ? d : next));
  }, []);
  const dev = __DEV__ && typeof override === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : undefined;
  return [dev ?? day, onTick];
}

/** "NEW ITEMS IN 05:32:10", ticking each second. */
export function Countdown({ onTick }: { onTick?: (now: number) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const after = useAfter();
  useEffect(() => {
    // on the turn of each second, so the figures change together with a real clock's
    const next = (t: number) => 1000 - (t % 1000) + 15;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      onTick?.(t);
      after(next(t), tick);
    };
    after(next(Date.now()), tick);
  }, [after, onTick]);
  const left = msToMidnight(new Date(now));
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`New items in ${shortClock(left)}`}>
      <Chip style={styles.clockChip}>
        <LineIcon name="clock" size={px(18)} tube="gold" weight={2.4} />
        <Print face="bold" size="micro" color="textDim" track="wider">
          NEW ITEMS IN
        </Print>
        <Print face="display" size={CLOCK_SIZE} color={tube.gold.tint} track="normal" glow={tube.gold.glass} style={styles.clockFigures}>
          {clock(left)}
        </Print>
      </Chip>
    </View>
  );
}

/** The red stamp across a card that has been bought today. */
function SoldStamp({ width }: { width: number }) {
  const size = Math.min(neonText.big, width * 0.2);
  return (
    <View pointerEvents="none" style={styles.stampBox}>
      <View style={[styles.stamp, { borderColor: tube.red.glass, boxShadow: [halo(tube.red.glass, 12, 0.8), inner(tube.red.glass, 10, 0.4)] }]}>
        <Print face="display" size={size} color={tube.red.tint} track="wide">
          SOLD
        </Print>
      </View>
    </View>
  );
}

/**
 * The price along a card's foot, drawn like the kit's price button: the whole card is the thing to press (a button
 * cannot sit inside another), and pressing it opens the pop-up with BUY.
 */
function PriceTag({ amount, can }: { amount: number; can: boolean }) {
  return (
    <View style={[styles.price, can ? { borderColor: tube.gold.glass, boxShadow: [halo(tube.gold.glass, 10, 0.6)] } : styles.priceOff]}>
      <Coin size={px(20)} />
      <Print face="bold" size={px(20)} color={can ? tube.gold.glass : 'textDim'} track="widest">
        {amount.toLocaleString('en-US')}
      </Print>
    </View>
  );
}

/** A small icon and a word in the card's foot, in place of its price. */
function FootNote({ icon, label, color }: { icon: LineIconName; label: string; color: string }) {
  return (
    <View style={styles.footNote}>
      <LineIcon name={icon} size={px(16)} color={color} weight={2.6} />
      <Print face="bold" size="tiny" color={color} track="wide">
        {label}
      </Print>
    </View>
  );
}

/** Behind the LIMITED item: slow rays and a patch of gold light that breathes, kept inside the card. */
function LimitedLight({ width, height, lit }: { width: number; height: number; lit: boolean }) {
  const rays = Math.max(width, height) * 1.3;
  const bloom = Math.max(width, height) * 1.2;
  return (
    <View pointerEvents="none" style={styles.lightLayer}>
      <Rays size={rays} alpha={0.12} style={[styles.at, { left: (width - rays) / 2, top: (height - rays) / 2 }]} />
      {lit && (
        <Breathe depth={0.45} swell={0.05} ms={1500} style={[styles.at, { left: (width - bloom) / 2, top: (height - bloom) / 2 }]}>
          <Bloom size={bloom} color={LIMITED_TUBE.glass} alpha={0.55} />
        </Breathe>
      )}
    </View>
  );
}

/** The art in the middle of a slot: the player's card, or the uniform on a lit ring with its name under it. */
function SlotArt({ slot, copies, width, height, number }: { slot: ShopSlot; copies: number; width: number; height: number; number: number }) {
  const uniform = slotUniform(slot);
  if (uniform) {
    const jerseyW = Math.max(px(40), Math.min(width * 0.7, (height - UNIFORM_NAME - px(10)) / JERSEY_FULL_RATIO));
    return (
      <View style={styles.artCenter}>
        <View style={styles.jerseyStage}>
          <StageRing width={jerseyW * 1.5} height={px(26)} tube={LIMITED_TUBE} style={styles.jerseyRing} />
          <Jersey kit={uniform.kit} number={number} width={jerseyW} shorts />
        </View>
        <Print face="display" size="small" color="text" track="close" center room={width} least={MIN_FIT_LABEL} style={styles.uniformName}>
          {uniform.name.toUpperCase()}
        </Print>
      </View>
    );
  }
  const player = mustPlayer(slot.item.id);
  const cardW = Math.max(px(56), Math.min(width, (height - TAG_ROOM) / sizes.cardRatio));
  return (
    <View style={[styles.artCenter, styles.cardArt]}>
      <ArcadeCard player={player} level={Math.max(1, levelOf(copies))} width={cardW} fresh={copies === 0} shine={slot.limited} />
    </View>
  );
}

export interface SlotCardProps {
  slot: ShopSlot;
  block: SlotBlock;
  coins: number;
  /** copies of the player owned (0 for a uniform) */
  copies: number;
  /** the number on a uniform's jersey: the captain's */
  number: number;
  width: number;
  height: number;
  onPress: () => void;
}

/** One of today's slots as a big card: a ribbon, the item, and its price (or why it cannot be bought). */
export function SlotCard({ slot, block, coins, copies, number, width, height, onPress }: SlotCardProps) {
  const tb = slotTube(slot);
  const limited = slot.limited;
  const edge = limited ? RIM : arcade.outline;
  const innerW = width - CARD_PAD * 2 - edge * 2;
  const artH = height - CARD_PAD * 2 - edge * 2 - RIBBON - FOOT - INNER_GAP * 2;
  const sold = block === 'sold';
  const can = shortBy({ coins }, slot.price) === 0;
  const name = slotName(slot);
  const label = `${limited ? 'Limited: ' : 'Deal: '}${name}. ${sold ? 'Sold today' : block === 'maxed' ? 'Already at the top level' : block === 'owned' ? 'Already yours' : `${slot.price.amount} coins`}`;
  const rarity = slot.item.kind === 'player' ? mustPlayer(slot.item.id).rarity : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.slot,
        { width, height, padding: CARD_PAD + edge },
        limited ? { boxShadow: sold ? undefined : [halo(tb.glass, 16, 0.75)] } : { borderWidth: arcade.outline, borderColor: sold ? night.line : tb.glass, boxShadow: sold ? undefined : [halo(tb.glass, 10, 0.55), inner(tb.glass, 14, 0.2)] },
        pressed && styles.pressed,
      ]}>
      {limited && (
        <>
          {/* a foil rim in the Legend colours, the card's face just inside it */}
          <LinearGradient colors={[...LIMITED_RIM]} locations={[...RIM_STOPS]} start={CORNER_A} end={CORNER_B} style={[StyleSheet.absoluteFill, styles.rim, sold && styles.dim]} />
          <View style={[styles.limitedFace, { left: RIM, top: RIM, right: RIM, bottom: RIM }]} />
        </>
      )}
      <View style={[styles.slotBody, sold && styles.dim]}>
        <View style={styles.ribbon}>
          {limited ? (
            <>
              <LineIcon name="spark" size={px(13)} color={LIMITED_TUBE.soft} />
              <Tag label={limitedLabel(slot)} tube="pink" small style={styles.limitedTag} />
              <LineIcon name="spark" size={px(13)} color={LIMITED_TUBE.soft} />
            </>
          ) : (
            rarity && (
              <>
                <Gems rarity={rarity} size={px(10)} />
                <Print face="bold" size="tiny" color={tb.tint} track="wider" upper>
                  {RARITY_LABEL[rarity]}
                </Print>
              </>
            )
          )}
        </View>
        <View style={[styles.art, { height: artH }]}>
          {limited && <LimitedLight width={innerW} height={artH} lit={!sold} />}
          <SlotArt slot={slot} copies={copies} width={innerW} height={artH} number={number} />
        </View>
        <View style={styles.foot}>
          {sold ? (
            <FootNote icon="clock" label="TOMORROW" color={night.textFaint} />
          ) : block === 'maxed' ? (
            <FootNote icon="crown" label="MAX LEVEL" color={tube.amber.soft} />
          ) : block === 'owned' ? (
            <FootNote icon="check" label="YOURS" color={tube.green.soft} />
          ) : (
            <PriceTag amount={slot.price.amount} can={can} />
          )}
        </View>
      </View>
      {sold && <SoldStamp width={width} />}
    </Pressable>
  );
}

export interface SlotRowProps {
  slots: readonly ShopSlot[];
  blockOf: (slot: ShopSlot) => SlotBlock;
  coins: number;
  owned: Record<string, number>;
  number: number;
  onPick: (slot: ShopSlot) => void;
}

/** Today's slots side by side, the LIMITED one a little wider, as big as the room allows. */
export function SlotRow({ slots, blockOf, coins, owned, number, onPick }: SlotRowProps) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const weights = slots.map((s) => (s.limited ? LIMITED_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const unit = total > 0 ? (box.w - GAP * (slots.length - 1)) / total : 0;
  // a deal card never wider than its picture needs, so on a wide screen the row sits in the middle instead of stretching
  const most = (box.h - CARD_PAD * 2 - arcade.outline * 2 - RIBBON - FOOT - INNER_GAP * 2 - TAG_ROOM) / sizes.cardRatio + CARD_PAD * 2 + arcade.outline * 2 + px(26);
  const deal = Math.min(unit, most);
  return (
    <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 &&
        slots.map((s, i) => (
          <Arrive key={s.id} delay={80 * i} from="up">
            <SlotCard
              slot={s}
              block={blockOf(s)}
              coins={coins}
              copies={s.item.kind === 'player' ? (owned[s.item.id] ?? 0) : 0}
              number={number}
              width={Math.floor(deal * weights[i])}
              height={box.h}
              onPress={() => onPick(s)}
            />
          </Arrive>
        ))}
    </View>
  );
}

/** What one more copy does for a player, in pictures: NEW!, the lamps of the level filling, or LV 2 → LV 3. */
function CopyLine({ copies }: { copies: number }) {
  if (copies === 0) return <Tag label="NEW PLAYER!" tube="pink" />;
  const now = levelProgress(copies);
  const then = levelProgress(copies + 1);
  if (copies >= MAX_COPIES) return <FootNote icon="crown" label="ALREADY AT MAX LEVEL" color={tube.amber.soft} />;
  if (then.level > now.level)
    return (
      <View style={styles.copyRow}>
        <Print face="display" size="large" color="textDim">{`LV ${now.level}`}</Print>
        <LineIcon name="arrow" size={px(18)} tube="green" weight={2.6} />
        <Glow face="display" size="large" tube="green">{`LV ${then.level}`}</Glow>
        <Print face="bold" size="tiny" color={tube.green.soft} track="wide">
          LEVEL UP!
        </Print>
      </View>
    );
  return (
    <View style={styles.copyRow} accessible accessibilityLabel={`One more copy toward level ${now.level + 1}`}>
      <Print face="display" size="large" color="textDim">{`LV ${now.level}`}</Print>
      <Pips have={then.have} of={then.need} tube="cyan" size={px(13)} />
    </View>
  );
}

export interface ShopDetailProps {
  slot: ShopSlot;
  block: SlotBlock;
  coins: number;
  copies: number;
  number: number;
  /** set once it has been bought: the pop-up turns into a short reveal */
  bought: { gain?: Gain } | null;
  onBuy: () => void;
  onClose: () => void;
}

/**
 * The pop-up once something is bought: the item popping in with sparks and what it means. A copy of a player the
 * child had plays its beat beside the card: one more lamp toward the next level, or the level up itself, the card's
 * frame upgrading in place. A tap on the card or the words jumps the beat to its end.
 */
function Bought({ slot, gain, copies, number, onClose }: { slot: ShopSlot; gain?: Gain; copies: number; number: number; onClose: () => void }) {
  const tb = slotTube(slot);
  const uniform = slotUniform(slot);
  const player: PlayerDef | null = slot.item.kind === 'player' ? mustPlayer(slot.item.id) : null;
  const [burst, setBurst] = useState(0);
  const after = useAfter();
  const copy = useCopyBeat(player ? gain : undefined, copies);
  useEffect(() => {
    after(60, () => setBurst((b) => b + 1));
  }, [after]);
  const up = copy.plan?.kind === 'levelUp';
  const art = uniform ? (
    <View style={styles.bigJersey}>
      <StageRing width={BIG_JERSEY * 1.45} height={px(30)} tube={LIMITED_TUBE} style={styles.bigRing} />
      <Jersey kit={uniform.kit} number={number} width={BIG_JERSEY} shorts />
    </View>
  ) : player ? (
    <ArcadeCard player={player} level={copy.plan ? copy.plan.level : Math.max(1, levelOf(copies))} levelFrom={up ? copy.plan?.levelBefore : undefined} levelUp={up ? copy.levelUp : undefined} width={BIG_CARD} shine onPress={copy.plan ? copy.finish : undefined} />
  ) : null;
  const title = uniform ? 'YOURS!' : gain?.isNew ? 'NEW PLAYER!' : up ? 'LEVEL UP!' : '+1 COPY';
  const sub = uniform ? 'Your squad wears it now.' : gain?.isNew ? `${player?.name} joins your collection.` : gain && copy.plan ? copyLine(gain, copies) : `One more ${player?.name} card.`;
  return (
    <Popup onDismiss={onClose} tube={tb} width={px(520)} style={styles.detail}>
      <View style={styles.detailRow}>
        <View style={styles.revealArt}>
          <Arrive from="pop">{art}</Arrive>
          <Sparks burst={burst} around count={40} reach={150} />
        </View>
        <View style={styles.detailWords}>
          <Glow face="display" size="big" tube={tb} track="close">
            {title}
          </Glow>
          <Print face="medium" size="body" color="textMuted">
            {sub}
          </Print>
          {copy.plan && (
            <Pressable onPress={copy.finish} accessibilityRole="button" accessibilityLabel="Show it all">
              <CopyMeter plan={copy.plan} beat={copy.beat} gained={copy.gained} width={WORDS - px(20)} />
            </Pressable>
          )}
          <GoldButton label="NICE!" icon="check" size="small" onPress={onClose} style={styles.detailButton} />
        </View>
      </View>
    </Popup>
  );
}

/** The pop-up for one slot: the item up close, what it is, and BUY with its price. After buying, a short reveal. */
export function ShopDetail({ slot, block, coins, copies, number, bought, onBuy, onClose }: ShopDetailProps) {
  const tb = slotTube(slot);
  const uniform = slotUniform(slot);
  const player = slot.item.kind === 'player' ? mustPlayer(slot.item.id) : null;
  const name = fitText(slotName(slot).toUpperCase(), 'display', neonText.big, WORDS, 'close', MIN_FIT_LABEL);
  const short = shortBy({ coins }, slot.price);

  if (bought) return <Bought slot={slot} gain={bought.gain} copies={copies} number={number} onClose={onClose} />;

  const art = uniform ? (
    <View style={styles.bigJersey}>
      <StageRing width={BIG_JERSEY * 1.45} height={px(30)} tube={LIMITED_TUBE} style={styles.bigRing} />
      <Jersey kit={uniform.kit} number={number} width={BIG_JERSEY} shorts />
    </View>
  ) : player ? (
    <ArcadeCard player={player} level={Math.max(1, levelOf(copies))} width={BIG_CARD} fresh={copies === 0} shine />
  ) : null;

  const kind = uniform?.holiday ? `${uniform.holiday} uniform` : uniform ? 'Limited-edition uniform' : player ? `${teamById(player.team).place} ${teamById(player.team).name} · ${RARITY_LABEL[player.rarity]}` : '';
  const about = uniform?.month !== undefined ? `${uniform.blurb ?? ''} Sold only in the Daily Shop, and only in ${MONTH_NAMES[uniform.month - 1]}.`.trim() : uniform ? `${uniform.blurb ?? ''} Sold only in the Daily Shop, and only on its day.`.trim() : slot.limited ? 'Featured today: pick exactly who you get.' : 'A daily deal: pick this player instead of hoping for them in a pack.';
  return (
    <Popup onDismiss={onClose} tube={tb} width={px(560)} style={styles.detail}>
      <View style={styles.detailRow}>
        <View style={styles.detailArt}>{art}</View>
        <View style={styles.detailWords}>
          <View style={styles.detailHead}>
            {slot.limited ? <Tag label={limitedLabel(slot)} tube="pink" small /> : player && <Gems rarity={player.rarity} size={px(11)} />}
            <Print face="bold" size="tiny" color={tb.soft} track="wide" upper room={WORDS - px(110)} least={MIN_FIT_LABEL}>
              {slot.limited ? 'Only today' : 'Daily deal'}
            </Print>
          </View>
          {name.text.split('\n').map((line) => (
            <Glow key={line} face="display" size={name.size} tube={tb} track="close">
              {line}
            </Glow>
          ))}
          <Print face="bold" size="tiny" color="textFaint" track="wide" upper room={WORDS} least={MIN_FIT_LABEL}>
            {kind}
          </Print>
          <Print face="medium" size="small" color="textMuted">
            {about}
          </Print>
          {player && block !== 'sold' && <CopyLine copies={copies} />}
          <View style={styles.detailAction}>
            {block === 'sold' ? (
              <GhostButton label="SOLD · BACK TOMORROW" icon="clock" tube="red" disabled accessibilityLabel="Sold. Something new comes tomorrow" style={styles.detailButton} />
            ) : block === 'maxed' ? (
              <GhostButton label="MAX LEVEL" icon="crown" tube="amber" disabled style={styles.detailButton} />
            ) : block === 'owned' ? (
              <GhostButton label="YOURS ALREADY" icon="check" tube="green" disabled style={styles.detailButton} />
            ) : (
              <View style={styles.buy}>
                <GoldButton
                  label={`BUY  ${slot.price.amount.toLocaleString('en-US')}`}
                  art={<Coin size={px(20)} />}
                  size="small"
                  quiet
                  disabled={short > 0}
                  onPress={onBuy}
                  accessibilityLabel={short > 0 ? `${slotName(slot)} costs ${slot.price.amount} coins. You need ${short} more` : `Buy ${slotName(slot)} for ${slot.price.amount} coins`}
                  style={styles.detailButton}
                />
                {short > 0 && (
                  <Print face="bold" size="tiny" color={tube.pink.soft} track="normal">
                    {`${short.toLocaleString('en-US')} MORE TO GO`}
                  </Print>
                )}
              </View>
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

/** A small lit dot: "something new in here". */
export function NewDot({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.newDot, { backgroundColor: tube.pink.glass, boxShadow: [halo(tube.pink.glass, 7, 1)] }, style]} />;
}

const CORNER_A = { x: 0, y: 0 } as const;
const CORNER_B = { x: 1, y: 1 } as const;
const NEW_DOT = px(9);

const styles = StyleSheet.create({
  clockChip: {
    gap: px(8),
  },
  clockFigures: {
    minWidth: CLOCK_W,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: GAP,
  },
  slot: {
    borderRadius: arcade.rTile,
    backgroundColor: night.tile,
  },
  rim: {
    borderRadius: arcade.rTile,
  },
  limitedFace: {
    position: 'absolute',
    borderRadius: arcade.rTile - RIM,
    backgroundColor: night.tile,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  dim: {
    opacity: 0.4,
  },
  slotBody: {
    flex: 1,
    gap: INNER_GAP,
  },
  ribbon: {
    height: RIBBON,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(5),
  },
  limitedTag: {
    alignSelf: 'center',
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardArt: {
    paddingTop: TAG_ROOM,
  },
  lightLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    borderRadius: arcade.rWell,
  },
  at: {
    position: 'absolute',
  },
  jerseyStage: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  jerseyRing: {
    position: 'absolute',
    bottom: -px(10),
  },
  uniformName: {
    marginTop: px(10),
    height: UNIFORM_NAME,
  },
  foot: {
    height: FOOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
  },
  price: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(7),
    height: sizes.tap,
    paddingHorizontal: px(8),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  priceOff: {
    borderColor: night.lineLit,
  },
  stampBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    paddingHorizontal: px(12),
    paddingVertical: px(4),
    borderWidth: px(3),
    borderRadius: arcade.rButton,
    backgroundColor: fade(night.pit, 0.82),
    transform: [{ rotate: '-14deg' }],
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(8),
  },
  detail: {
    gap: space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  detailArt: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: px(6),
  },
  revealArt: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: px(6),
  },
  bigJersey: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: px(8),
  },
  bigRing: {
    position: 'absolute',
    bottom: -px(6),
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
  newDot: {
    width: NEW_DOT,
    height: NEW_DOT,
    borderRadius: NEW_DOT / 2,
  },
});
