/** The pack shop: a prize machine's window of packs to buy with coins, and the packs waiting to be opened beside it. */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { playSfx } from '@/audio/sound';
import { teamById } from '@/data/roster';
import { RARITIES, RARITY_LABEL } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { SHOP_PACKS, packById, type PackDef } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { arcade, blend, fade, neonText, night, rarityPaint, tube, type Tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton, PriceButton } from '@/ui/arcade/Buttons';
import { Gems } from '@/ui/arcade/Card';
import { FOIL_RATIO, FoilPack, foilFor } from '@/ui/arcade/Foil';
import { fitText, type FittedText } from '@/ui/arcade/fitText';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL } from '@/ui/arcade/measure';
import { Popup } from '@/ui/arcade/Popup';
import { Bulbs } from '@/ui/arcade/Room';
import { CountBadge, NeonPanel, Well } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';
import { useAfter } from '@/ui/hooks';

/** the right-hand panel of packs waiting to be opened */
const READY_W = px(236);
/** the room for a waiting pack's name: the panel less its padding, the well's, and the small pack beside it */
const WELL_WORDS = READY_W - px(22) - px(4) - px(18) - px(36) - px(10);
/** the corner of a waiting pack's row that its "?" takes from the name */
const HELP_ROOM = px(14);
/** the marquee bulbs swap every so often: a slow chase, never a flash */
const CHASE_MS = 900;
/** the strip of bulbs along the top of the machine's window */
const STRIP_H = px(18);
/** everything in a shop column but the pack: the gaps, the name, the line under it, the price and the note */
const COLUMN_REST = px(150);

function percent(p: number): string {
  const v = p * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
}

function safePack(id: string): PackDef | null {
  try {
    return packById(id);
  } catch {
    return null;
  }
}

/** The tube a pack's name is lit in: its foil's own light. */
function packTube(pack: PackDef): Tube {
  const f = foilFor(pack);
  return { glass: f.glow, tint: blend(f.glow, night.white, 0.86), soft: f.ink };
}

/** What is inside, in plain words from the pack's own odds. */
function inside(pack: PackDef): string {
  if (pack.team) return `${pack.cards} ${teamById(pack.team).name} players`;
  return pack.guarantee ? `1 ${RARITY_LABEL[pack.guarantee]} or better inside` : 'Any rarity inside';
}

/** Fitted lettering: one line, or two when it had to break (see `fitText`); never cut off. */
function PrintFit({ fit, ...rest }: { fit: FittedText } & Omit<React.ComponentProps<typeof Print>, 'children' | 'size' | 'lines' | 'room'>) {
  return (
    <Print size={fit.size} {...rest}>
      {fit.text}
    </Print>
  );
}

/** A fitted sign: a neon line can only be one line, so a sign that had to break is two of them. */
function GlowLines({ fit, tube: t, center, style }: { fit: FittedText; tube: Tube; center?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {fit.text.split('\n').map((line) => (
        <Glow key={line} face="sign" size={fit.size} tube={t} track="close" center={center}>
          {line}
        </Glow>
      ))}
    </View>
  );
}

/** A small round "what is inside" button. */
function OddsButton({ pack, onPress }: { pack: PackDef; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`What is inside the ${pack.name}`}
      hitSlop={space.sm}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.odds, pressed && styles.pressed]}>
      <View style={styles.oddsDot}>
        <LineIcon name="help" size={px(15)} color={night.textDim} weight={2.6} />
      </View>
    </Pressable>
  );
}

/** One lit column in the machine's window: the pack, its name, what is inside and its price. */
function ShopColumn({ pack, coins, packW, onBuy, onOdds }: { pack: PackDef; coins: number; packW: number; onBuy: () => void; onOdds: () => void }) {
  const short = pack.price - coins;
  const [width, setWidth] = useState(0);
  const tb = packTube(pack);
  return (
    <View style={styles.column} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <LinearGradient colors={[fade(foilFor(pack).glow, 0.22), fade(night.panel, 0)]} locations={[0, 0.58]} style={[StyleSheet.absoluteFill, styles.columnLight]} />
      <FoilPack pack={pack} width={packW} />
      <GlowLines fit={fitText(pack.name.toUpperCase(), 'sign', neonText.large, width > 0 ? width - px(14) : READY_W, 'close', MIN_FIT_LABEL)} tube={tb} center style={styles.packName} />
      <PrintFit fit={fitText(inside(pack), 'body', neonText.tiny, width > 0 ? width - px(12) : READY_W)} face="body" color="textMuted" center style={styles.packInside} />
      <PriceButton price={pack.price} can={short <= 0} quiet onPress={onBuy} accessibilityLabel={`Buy the ${pack.name} for ${pack.price} coins`} style={styles.price} />
      <View style={styles.noteBox}>
        {short > 0 && (
          <PrintFit fit={fitText(`${short.toLocaleString('en-US')} MORE TO GO`, 'bold', neonText.micro, width > 0 ? width - px(8) : READY_W, 'normal')} face="bold" color={tube.pink.soft} track="normal" center />
        )}
      </View>
      <OddsButton pack={pack} onPress={onOdds} />
    </View>
  );
}

/** One kind of pack waiting to be opened: a small pack, its name, a line about it, and its button. */
function ReadyWell({ pack, line, onOdds, children }: { pack: PackDef; line: string; onOdds: () => void; children: React.ReactNode }) {
  // the words get whatever the row leaves them, measured, so the longest team pack's name still fits
  const [room, setRoom] = useState(WELL_WORDS);
  return (
    <Well style={styles.well}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What is inside the ${pack.name}`}
        onPress={() => {
          tapFeedback();
          onOdds();
        }}
        style={({ pressed }) => [styles.wellHead, pressed && styles.pressed]}>
        <FoilPack pack={pack} width={px(36)} flat />
        <View style={styles.wellWords} onLayout={(e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.width)}>
          {/* the name keeps clear of the "?" in the corner above it */}
          <PrintFit fit={fitText(pack.name, 'bold', neonText.body, room - HELP_ROOM, 'tight', 0.8)} face="bold" track="tight" />
          <PrintFit fit={fitText(line, 'medium', neonText.tiny, room)} face="medium" color="textDim" />
        </View>
        <View style={styles.wellHelp}>
          <LineIcon name="help" size={px(12)} color={night.textFaint} weight={2.6} />
        </View>
      </Pressable>
      {children}
    </Well>
  );
}

function OddsPopup({ pack, onClose }: { pack: PackDef; onClose: () => void }) {
  return (
    <Popup onDismiss={onClose} tube={packTube(pack)} width={px(470)} style={styles.oddsPanel}>
      <View style={styles.oddsHead}>
        <FoilPack pack={pack} width={px(56)} />
        <View style={styles.grow}>
          <GlowLines fit={fitText(pack.name.toUpperCase(), 'sign', neonText.sign, px(330), 'close', MIN_FIT_LABEL)} tube={packTube(pack)} />
          <Print face="medium" size="small" color="textMuted" style={styles.oddsLead}>
            {`${pack.cards} players in every pack. Each one has these chances:`}
          </Print>
        </View>
      </View>
      <View style={styles.oddsRow}>
        {RARITIES.map((r) => {
          const tb = tube[rarityPaint[r].tube];
          return (
            <Well key={r} style={[styles.oddsCell, { borderColor: fade(tb.glass, 0.5) }]}>
              <Gems rarity={r} size={px(9)} />
              <Print face="bold" size="tiny" color={tb.tint} track="wide" upper>
                {RARITY_LABEL[r]}
              </Print>
              <Print face="display" size="sign" color={tb.soft}>
                {percent(pack.odds[r])}
              </Print>
            </Well>
          );
        })}
      </View>
      <Print face="medium" size="tiny" color="textDim" center>
        {`${pack.guarantee ? `One player is always ${RARITY_LABEL[pack.guarantee]} or better. ` : ''}Players you do not have yet turn up more often. Coins come from playing: nothing in this game costs real money.`}
      </Print>
      <GoldButton size="small" label="GOT IT" onPress={onClose} style={styles.gotIt} />
    </Popup>
  );
}

export default function Packs() {
  const router = useRouter();
  const coins = useSave((s) => s.coins);
  const packs = useSave((s) => s.packs);
  const freePackDay = useSave((s) => s.freePackDay);
  const buyPack = useSave((s) => s.buyPack);
  const claimFreePack = useSave((s) => s.claimFreePack);
  const [odds, setOdds] = useState<PackDef | null>(null);
  const [phase, setPhase] = useState(0);
  const [stripW, setStripW] = useState(0);
  const [row, setRow] = useState({ w: 0, h: 0 });
  const after = useAfter();

  // the marquee's slow chase
  useEffect(() => {
    const tick = () => {
      setPhase((p) => p + 1);
      after(CHASE_MS, tick);
    };
    after(CHASE_MS, tick);
  }, [after]);

  const free = freePackDay !== dayKey();
  const mine = Object.keys(packs)
    .filter((id) => packs[id] > 0)
    .map((id) => safePack(id))
    .filter((p): p is PackDef => p !== null);
  const waiting = mine.reduce((n, p) => n + packs[p.id], 0) + (free ? 1 : 0);
  const open = (id: string) => router.push({ pathname: '/open', params: { pack: id } });
  const playground = packById('playground');

  const buy = (pack: PackDef) => {
    if (!buyPack(pack.id)) return;
    playSfx('buy');
    open(pack.id);
  };

  const claim = () => {
    if (!claimFreePack()) return;
    playSfx('star');
    open('playground');
  };

  // the packs grow with the room the window has: as wide as a column allows, as tall as leaves room for the rest
  const gaps = px(8) * (SHOP_PACKS.length - 1);
  const colW = row.w > 0 ? (row.w - gaps) / SHOP_PACKS.length : 0;
  const packW = row.h > 0 ? Math.round(Math.max(px(64), Math.min(colW * 0.7, (row.h - COLUMN_REST) / FOIL_RATIO))) : px(100);

  return (
    <View style={styles.root}>
      <ArcadeScreen title="PACKS" tube="pink" style={styles.body}>
        <View style={styles.panels}>
          <NeonPanel tube="cyan" style={styles.machine}>
            <View style={styles.strip} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
              {stripW > 0 && <Bulbs width={stripW - px(16)} phase={phase} />}
            </View>
            <View style={styles.columns} onLayout={(e) => setRow({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
              {SHOP_PACKS.map((p) => (
                <ShopColumn key={p.id} pack={p} coins={coins} packW={packW} onBuy={() => buy(p)} onOdds={() => setOdds(p)} />
              ))}
            </View>
          </NeonPanel>

          <NeonPanel tube="pink" style={styles.ready}>
            <View style={styles.readyHead}>
              <Glow face="sign" size={px(18)} tube="pink" track="close">
                READY TO OPEN
              </Glow>
              <CountBadge count={waiting} tube="pink" />
            </View>
            <ScrollView style={styles.grow} contentContainerStyle={styles.wells} showsVerticalScrollIndicator={false}>
              <ReadyWell pack={playground} line={free ? 'Free every day' : 'Free again tomorrow'} onOdds={() => setOdds(playground)}>
                {free ? (
                  <GoldButton size="small" label="OPEN" quiet onPress={claim} accessibilityLabel="Open today's free Playground Pack" />
                ) : (
                  <GhostButton label="TOMORROW" lit={false} disabled accessibilityLabel="The next free pack comes tomorrow" />
                )}
              </ReadyWell>
              {mine.map((p) => (
                <ReadyWell key={p.id} pack={p} line={packs[p.id] > 1 ? `${packs[p.id]} to open` : p.team ? inside(p) : `${p.cards} players inside`} onOdds={() => setOdds(p)}>
                  <GoldButton size="small" label={packs[p.id] > 1 ? `OPEN  x${packs[p.id]}` : 'OPEN'} onPress={() => open(p.id)} accessibilityLabel={`Open the ${p.name}`} />
                </ReadyWell>
              ))}
              {/* with nothing else waiting, say where the next pack comes from instead of leaving the panel empty */}
              {mine.length === 0 && (
                <View style={styles.none}>
                  <LineIcon name="pack" size={px(26)} color={night.lineLit} weight={2} />
                  <Print face="body" size="small" color="textFaint" center>
                    Packs you get wait here until you open them.
                  </Print>
                </View>
              )}
            </ScrollView>
          </NeonPanel>
        </View>
      </ArcadeScreen>
      {odds && <OddsPopup pack={odds} onClose={() => setOdds(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    paddingTop: px(12),
    paddingBottom: px(12),
  },
  grow: {
    flex: 1,
  },
  none: {
    alignItems: 'center',
    gap: px(8),
    paddingTop: px(14),
    paddingHorizontal: px(10),
  },
  panels: {
    flex: 1,
    flexDirection: 'row',
    gap: px(16),
  },
  machine: {
    flex: 1,
  },
  strip: {
    height: STRIP_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.well,
    borderBottomWidth: arcade.hairline,
    borderBottomColor: night.line,
    borderTopLeftRadius: arcade.rPanel - arcade.outline,
    borderTopRightRadius: arcade.rPanel - arcade.outline,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: px(8),
    padding: px(8),
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: px(4),
    borderRadius: arcade.rWell,
    borderWidth: arcade.hairline,
    borderColor: night.line,
  },
  columnLight: {
    borderRadius: arcade.rWell,
  },
  packName: {
    marginTop: px(9),
  },
  packInside: {
    marginTop: px(3),
  },
  price: {
    marginTop: px(8),
    width: '88%',
    maxWidth: px(146),
  },
  noteBox: {
    marginTop: px(5),
    height: px(14),
    justifyContent: 'center',
  },
  odds: {
    position: 'absolute',
    top: px(4),
    right: px(4),
  },
  oddsDot: {
    width: px(26),
    height: px(26),
    borderRadius: px(13),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.line,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
  ready: {
    width: READY_W,
    paddingTop: px(11),
    paddingHorizontal: px(11),
  },
  readyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  wells: {
    gap: px(9),
    paddingTop: px(9),
    paddingBottom: px(11),
  },
  well: {
    gap: px(8),
  },
  wellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
  wellWords: {
    flex: 1,
    gap: px(2),
  },
  wellHelp: {
    position: 'absolute',
    right: -px(4),
    top: -px(4),
  },
  oddsPanel: {
    gap: space.md,
  },
  oddsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  oddsLead: {
    marginTop: space.xs,
  },
  oddsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  oddsCell: {
    flex: 1,
    alignItems: 'center',
    gap: px(3),
    paddingVertical: space.sm,
  },
  gotIt: {
    alignSelf: 'center',
    minWidth: px(160),
  },
});
