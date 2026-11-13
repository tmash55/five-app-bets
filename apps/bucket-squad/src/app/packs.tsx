/** The card shop: packs waiting to be opened, the free daily pack, and packs to buy with coins. */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { RARITIES, RARITY_LABEL } from '@/data/types';
import { SHOP_PACKS, packById, type PackDef } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { px, size as sizes, space } from '@/theme/tokens';
import { RARITY_COLOR, Tag } from '@/ui/Bits';
import { Icon } from '@/ui/Icon';
import { Overlay, Panel } from '@/ui/Overlay';
import { PackArt } from '@/ui/PackArt';
import { Screen } from '@/ui/Screen';
import { IconButton, Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

const ART_W = sizes.cardSmall;
const CARD_W = sizes.card + space.xxl;

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

function PackCard({ pack, tag, tagFill, note, onOdds, children }: { pack: PackDef; tag?: string; tagFill?: 'coral' | 'sun'; note?: string; onOdds: () => void; children: React.ReactNode }) {
  return (
    <Sticker fill="paper" round="lg" raise="mid" style={styles.card} face={styles.cardFace}>
      <View>
        <PackArt pack={pack} width={ART_W} />
        {tag !== undefined && <Tag label={tag} fill={tagFill ?? 'coral'} textColor={tagFill === 'sun' ? 'ink' : 'white'} style={styles.tag} />}
      </View>
      <Txt font="display" size="body" center lines={1}>
        {pack.name}
      </Txt>
      <Txt size="tiny" color="inkSoft" center lines={2} style={styles.tagline}>
        {note ?? pack.tagline}
      </Txt>
      {children}
      <View style={styles.odds}>
        <IconButton name="help" label={`What is inside the ${pack.name}`} diameter={sizes.badgeSmall + space.xs} fill="white" iconColor="grape" onPress={onOdds} />
      </View>
    </Sticker>
  );
}

function OddsOverlay({ pack, onClose }: { pack: PackDef; onClose: () => void }) {
  return (
    <Overlay onDismiss={onClose}>
      <Panel width={sizes.panelMax - px(80)} face={styles.oddsPanel}>
        <View style={styles.oddsHead}>
          <PackArt pack={pack} width={sizes.avatarLarge} />
          <View style={styles.oddsText}>
            <StickerText size="title" color="sun">
              {pack.name.toUpperCase()}
            </StickerText>
            <Txt size="small" color="inkSoft">
              {`${pack.cards} players in every pack. Each one has these chances:`}
            </Txt>
          </View>
        </View>
        <View style={styles.oddsRow}>
          {RARITIES.map((r) => (
            <View key={r} style={styles.oddsCell}>
              <Tag label={RARITY_LABEL[r]} fill={RARITY_COLOR[r].deep} textColor="white" style={styles.centerSelf} />
              <Txt font="display" size="large" center>
                {percent(pack.odds[r])}
              </Txt>
            </View>
          ))}
        </View>
        <Txt size="small" color="inkSoft" center>
          {`${pack.guarantee ? `One player is always ${RARITY_LABEL[pack.guarantee]} or better. ` : ''}Players you do not have yet turn up more often. Coins come from playing: nothing in this game costs real money.`}
        </Txt>
        <StickerButton label="GOT IT" fill="mint" textSize="body" onPress={onClose} />
      </Panel>
    </Overlay>
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

  const free = freePackDay !== dayKey();
  const mine = Object.keys(packs)
    .filter((id) => packs[id] > 0)
    .map((id) => safePack(id))
    .filter((p): p is PackDef => p !== null);
  const open = (id: string) => router.push({ pathname: '/open', params: { pack: id } });

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

  return (
    <View style={styles.root}>
      <Screen title="PACKS" tone="grape">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.group}>
            <Txt font="display" size="body" color="white" shadow>
              YOUR PACKS
            </Txt>
            <View style={styles.cards}>
              <PackCard pack={packById('playground')} tag={free ? 'FREE!' : undefined} note={free ? 'A free pack every day. Come and get it!' : 'You got today’s free pack. Come back tomorrow!'} onOdds={() => setOdds(packById('playground'))}>
                <StickerButton label={free ? 'GET IT!' : 'TOMORROW'} icon={free ? 'gift' : undefined} iconColor="white" fill={free ? 'coral' : 'paperDim'} textColor={free ? 'white' : 'inkFaint'} textSize="body" height={sizes.buttonSmall} disabled={!free} quiet onPress={claim} style={styles.action} />
              </PackCard>
              {mine.map((p) => (
                <PackCard key={p.id} pack={p} tag={`x${packs[p.id]}`} tagFill="sun" onOdds={() => setOdds(p)}>
                  <StickerButton label="OPEN" icon="pack" iconColor="white" fill="mint" textSize="body" height={sizes.buttonSmall} onPress={() => open(p.id)} style={styles.action} />
                </PackCard>
              ))}
            </View>
          </View>
          <View style={styles.group}>
            <Txt font="display" size="body" color="white" shadow>
              CARD SHOP
            </Txt>
            <View style={styles.cards}>
              {SHOP_PACKS.map((p) => {
                const short = p.price - coins;
                return (
                  <PackCard key={p.id} pack={p} note={short > 0 ? `${short.toLocaleString('en-US')} more coins to go. Play games to earn them!` : undefined} onOdds={() => setOdds(p)}>
                    <StickerButton fill="sun" height={sizes.buttonSmall} disabled={short > 0} quiet onPress={() => buy(p)} accessibilityLabel={`Buy the ${p.name} for ${p.price} coins`} style={styles.action}>
                      <Icon name="coin" color="sun" size={sizes.icon} />
                      <Txt font="display" size="body">
                        {p.price.toLocaleString('en-US')}
                      </Txt>
                    </StickerButton>
                  </PackCard>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </Screen>
      {odds && <OddsOverlay pack={odds} onClose={() => setOdds(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    gap: space.xl,
    paddingRight: space.lg,
    alignItems: 'center',
  },
  group: {
    gap: space.xs,
  },
  cards: {
    flexDirection: 'row',
    gap: space.md,
  },
  card: {
    width: CARD_W,
  },
  cardFace: {
    alignItems: 'center',
    gap: space.hair,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  tag: {
    position: 'absolute',
    top: space.sm,
    right: -space.md,
    transform: [{ rotate: '8deg' }],
  },
  tagline: {
    minHeight: space.xxl - space.xs,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: space.xs,
  },
  odds: {
    position: 'absolute',
    top: space.xs,
    left: space.xs,
  },
  oddsPanel: {
    gap: space.sm,
  },
  oddsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  oddsText: {
    flex: 1,
  },
  oddsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  oddsCell: {
    flex: 1,
    gap: space.hair,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});
