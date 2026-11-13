/**
 * The arcade's building blocks on one page, for looking at them while they are being made.
 * Only in a development build: a store build sends anyone who lands here home.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PLAYERS, TEAMS } from '@/data/roster';
import { RARITIES, type PlayerDef } from '@/data/types';
import { RATING_KEYS, RATING_LABELS } from '@/game/sim/ratings';
import { SHOP_PACKS, packById, teamPackId } from '@/meta/packs';
import { night, rarityPaint, tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton, NeonTile, PriceButton, RoundButton } from '@/ui/arcade/Buttons';
import { ArcadeCard, CardBack, Gems, HeadCell } from '@/ui/arcade/Card';
import { FoilPack } from '@/ui/arcade/Foil';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Bloom, Bulbs, Floor, Rays, Spotlight, StageRing, StageWall } from '@/ui/arcade/Room';
import { Meter, Pips, StatRow } from '@/ui/arcade/SegBar';
import { Chip, CountBadge, NeonPanel, OvrBox, Plate, Tag, TeamMark, Well } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

function best(rarity: PlayerDef['rarity']): PlayerDef {
  return PLAYERS.find((p) => p.rarity === rarity) ?? PLAYERS[0];
}

function Lettering() {
  const player = best('epic');
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        <View style={styles.row}>
          <Glow tube="pink">PACKS</Glow>
          <Glow tube="cyan">COLLECTION</Glow>
          <Glow tube="green" lit={false}>
            OFF
          </Glow>
        </View>
        <View style={styles.row}>
          <Glow face="sign" size="big" tube="purple" track="widest">
            EPIC
          </Glow>
          <Glow face="sign" size="sign" tube="gold" track="wide">
            LEGEND PACK
          </Glow>
        </View>
        <View style={styles.row}>
          <Chip>
            <Print face="bold" size="small" color="textFaint" track="wider">
              LADDER
            </Print>
            <Print face="bold" size="small" color="textSoft" track="wider" glow={tube.indigo.soft}>
              SILVER
            </Print>
          </Chip>
          <Chip>
            <Print face="bold" size="body" color={tube.green.glass} track="wider" glow={tube.green.glass}>
              24 OF 48
            </Print>
            <Meter value={0.5} />
          </Chip>
          <Plate tube="blue">
            <Print face="bold" size="tiny" track="normal">
              DASH BENNETT
            </Print>
            <Print face="bold" size="tiny" color={tube.blue.soft} track="normal">
              75
            </Print>
          </Plate>
        </View>
        <View style={styles.row}>
          <Tag label="NEW!" />
          <Tag label="FREE" tube="green" small />
          <CountBadge count={3} tube="green" />
          <CountBadge count={12} />
          <OvrBox value={81} tube="purple" />
          <OvrBox value={76} tube="blue" small />
          <TeamMark team={TEAMS[0]} />
          <TeamMark team={TEAMS[2]} small />
          <Gems rarity="legend" />
          <Pips have={3} of={6} />
        </View>
        <View style={styles.stats}>
          {RATING_KEYS.slice(0, 3).map((key, i) => (
            <StatRow key={key} label={RATING_LABELS[key].toUpperCase()} value={player.ratings[key]} tube={i === 2 ? 'pink' : 'cyan'} />
          ))}
          <StatRow label="SMALL" value={64} small />
        </View>
        <View style={styles.row}>
          {(['back', 'arrow', 'check', 'close', 'plus', 'swap', 'gear', 'pack', 'grid', 'cards', 'squad', 'target', 'star', 'ball', 'crown', 'lock', 'help'] as const).map((name) => (
            <LineIcon key={name} name={name} size={px(20)} tube="cyan" />
          ))}
        </View>
        <View style={styles.row}>
          {(['sound', 'mute', 'music', 'buzz', 'trophy', 'ladder', 'flag', 'gift', 'bolt', 'home', 'bus', 'up', 'play', 'pause', 'spark', 'gem', 'dot'] as const).map((name) => (
            <LineIcon key={name} name={name} size={px(20)} tube="pink" />
          ))}
        </View>
      </View>
      <View style={styles.column}>
        <GoldButton size="big" label="PLAY" sub="TOUR · NEXT STOP: STOMPERS" icon="play" />
        <View style={styles.row}>
          <NeonTile tube="pink" icon="pack" title="PACKS" sub="1 free pack today" badge={1} style={styles.tile} />
          <NeonTile tube="cyan" icon="grid" title="COLLECTION" sub="24 of 48 players" style={styles.tile} />
        </View>
        <GoldButton label="NEXT PLAYER" iconAfter="arrow" />
        <View style={styles.row}>
          <GoldButton size="small" label="OPEN" style={styles.grow} />
          <PriceButton price={700} />
          <PriceButton price={1800} can={false} />
        </View>
        <View style={styles.row}>
          <GhostButton label="OPEN ANOTHER" icon="pack" tube="pink" style={styles.grow} />
          <GhostButton label="OFF" lit={false} small />
          <RoundButton icon="gear" label="Settings" />
          <RoundButton icon="close" label="Close" tube="pink" />
        </View>
      </View>
    </View>
  );
}

function Cards() {
  return (
    <View style={styles.sheet}>
      <View style={styles.cardRow}>
        {RARITIES.map((r, i) => (
          <ArcadeCard key={r} player={best(r)} level={i + 1} width={px(138)} fresh={i === 2} shine={i === 3} />
        ))}
        <CardBack width={px(138)} />
      </View>
      <View style={styles.packRow}>
        {SHOP_PACKS.map((p) => (
          <FoilPack key={p.id} pack={p} width={px(78)} />
        ))}
        <FoilPack pack={packById(teamPackId(TEAMS[0].id))} width={px(78)} />
        <View style={styles.cells}>
          {PLAYERS.slice(0, 12).map((p, i) => (
            <HeadCell key={p.id} player={p} level={i % 4 === 3 ? 0 : 1} selected={i === 1} fresh={i === 2} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** the small sizes of a card, and its locked state */
function SmallCards() {
  return (
    <View style={styles.cardRow}>
      <ArcadeCard player={best('rare')} width={px(96)} level={2} />
      <ArcadeCard player={best('legend')} width={px(96)} locked level={0} />
      <ArcadeCard player={best('epic')} width={px(64)} level={3} />
      <ArcadeCard player={best('common')} width={px(64)} level={1} selected />
      <CardBack width={px(64)} tube={rarityPaint.legend.tube} />
      <FoilPack pack={SHOP_PACKS[0]} width={px(36)} />
      <FoilPack pack={SHOP_PACKS[2]} width={px(36)} />
    </View>
  );
}

function Room() {
  return (
    <View style={styles.columns}>
      <View style={styles.room}>
        <StageWall />
        <Rays size={px(360)} color={tube.purple.glass} alpha={0.42} count={18} fill={0.35} fadeAt={[0.36, 1]} style={styles.centered} />
        <Bloom size={px(240)} color={tube.purple.soft} style={styles.bloom} />
        <NeonPanel tube="pink" style={styles.panel}>
          <Glow face="sign" size="large" tube="pink" track="close">
            READY TO OPEN
          </Glow>
          <Well style={styles.well}>
            <Print face="bold" size="body">
              Playground Pack
            </Print>
            <Print face="medium" size="tiny" color="textDim">
              Free every day
            </Print>
          </Well>
        </NeonPanel>
      </View>
      <View style={styles.room}>
        <Spotlight width={px(300)} height={px(210)} style={styles.beam} />
        <Floor style={styles.floor} />
        <StageRing width={px(320)} height={px(52)} style={styles.ring} />
        <Bulbs width={px(300)} style={styles.bulbs} />
      </View>
    </View>
  );
}

/**
 * Bumped before each look at the game on a phone or simulator. A picture of this page then proves which
 * code the phone is really running: a phone that kept an older copy shows an older mark.
 */
const MARK = 'R6';

export default function KitScreen() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ArcadeScreen title={`KIT ${MARK}`} tube="green" style={styles.body}>
      {page === '2' ? <Cards /> : page === '3' ? <Room /> : page === '4' ? <SmallCards /> : <Lettering />}
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xl,
  },
  column: {
    flex: 1,
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.md,
  },
  sheet: {
    flex: 1,
    alignItems: 'center',
    gap: space.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: px(20),
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  cells: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: px(66) * 6 + px(5) * 5,
    marginLeft: space.sm,
    gap: px(5),
  },
  stats: {
    gap: space.sm,
    width: px(300),
  },
  tile: {
    flex: 1,
    height: px(84),
  },
  grow: {
    flex: 1,
  },
  room: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: px(12),
    borderWidth: px(1),
    borderColor: night.line,
  },
  centered: {
    position: 'absolute',
    left: px(10),
    top: -px(30),
  },
  bloom: {
    position: 'absolute',
    left: px(70),
    top: px(30),
  },
  panel: {
    position: 'absolute',
    right: space.md,
    top: space.md,
    width: px(170),
    padding: px(11),
    gap: space.sm,
  },
  well: {
    gap: px(2),
  },
  beam: {
    position: 'absolute',
    left: px(40),
    top: 0,
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: px(200),
    bottom: 0,
  },
  ring: {
    position: 'absolute',
    left: px(30),
    top: px(212),
  },
  bulbs: {
    position: 'absolute',
    left: px(40),
    top: space.sm,
  },
});
