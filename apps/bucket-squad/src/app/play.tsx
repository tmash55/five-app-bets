/** Pick a way to play: the Tour, the Ladder, or a quick game. */

import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { tierProgress } from '@/meta/ladder';
import { DIFFICULTY_NAMES } from '@/meta/setups';
import { nextTourGame, tourStars, toursFor } from '@/meta/tour';
import { useSave } from '@/state/save';
import { color, size as sizes, space, stroke, type ColorName } from '@/theme/tokens';
import { ProgressBar, Tag, TeamBadge } from '@/ui/Bits';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen, Sunburst } from '@/ui/Screen';
import { StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

function ModeCard({ title, text, icon, fill, onPress, children }: { title: string; text: string; icon: IconName; fill: ColorName; onPress: () => void; children: React.ReactNode }) {
  return (
    <StickerButton fill={fill} round="xl" raise="high" stretch onPress={onPress} accessibilityLabel={`${title}. ${text}`} style={styles.card} face={styles.cardFace}>
      <Sunburst strength={0.16} />
      <View style={styles.cardTop}>
        <Icon name={icon} size={sizes.iconHuge + space.sm} color="white" />
        <StickerText size="big" color="white" center>
          {title}
        </StickerText>
        <Txt font="bodyBold" size="body" color="ink" center style={styles.cardText}>
          {text}
        </Txt>
      </View>
      <View style={styles.foot}>{children}</View>
    </StickerButton>
  );
}

export default function Play() {
  const router = useRouter();
  const tour = useSave((s) => s.tour);
  const ladder = useSave((s) => s.ladder);
  const settings = useSave((s) => s.settings);
  const tours = toursFor(useSave((s) => s.homeTeam));
  const go = (href: Href) => () => router.push(href);

  let have = 0;
  let all = 0;
  for (const t of tours) {
    const s = tourStars(tour, t);
    have += s.have;
    all += s.all;
  }
  const firstOpen = tours.map((t) => ({ t, next: nextTourGame(tour, t) })).find((x) => x.next !== null);
  const nextStage = firstOpen && firstOpen.next ? firstOpen.t.stages[firstOpen.next.stage] : null;
  const tp = tierProgress(ladder.points);

  return (
    <Screen title="PLAY">
      <View style={styles.row}>
        <ModeCard title="TOUR" text="Beat every court and win its star player." icon="flag" fill="mint" onPress={go('/tour')}>
          <View style={styles.footRow}>
            <Icon name="star" size={sizes.icon} color="sun" />
            <Txt font="display" size="large">{`${have} / ${all}`}</Txt>
          </View>
          {nextStage ? (
            <View style={styles.footRow}>
              <Txt size="small" color="inkSoft">
                Next stop
              </Txt>
              <TeamBadge team={nextStage.team} diameter={sizes.badgeSmall} />
              <Txt font="display" size="body" lines={1}>
                {nextStage.team.name}
              </Txt>
            </View>
          ) : (
            <Tag label="Every court beaten!" fill="sun" />
          )}
        </ModeCard>

        <ModeCard title="LADDER" text="Climb from Rookie all the way to Legend." icon="ladder" fill="grape" onPress={go('/ladder')}>
          <View style={styles.footRow}>
            <Icon name="trophy" size={sizes.icon} color={tp.tier.color} />
            <Txt font="display" size="large">
              {tp.tier.name}
            </Txt>
          </View>
          {tp.next ? (
            <View style={styles.footBar}>
              <ProgressBar value={tp.span > 0 ? tp.have / tp.span : 1} fill={tp.next.color} />
              <Txt size="small" color="inkSoft" center>{`${tp.span - tp.have} points to ${tp.next.name}`}</Txt>
            </View>
          ) : (
            <Tag label="Top of the ladder!" fill="legend" />
          )}
        </ModeCard>

        <ModeCard title="QUICK GAME" text="Pick a team, pick a court and play." icon="bolt" fill="coral" onPress={go('/quick')}>
          <View style={styles.footRow}>
            <Icon name="ball" size={sizes.icon} color="orange" />
            <Txt font="display" size="large">{`${settings.format} on ${settings.format}`}</Txt>
          </View>
          <Txt size="small" color="inkSoft" center>{`${DIFFICULTY_NAMES[settings.difficulty]} level`}</Txt>
        </ModeCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
    paddingBottom: space.xs,
  },
  card: {
    flex: 1,
  },
  cardFace: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    gap: 0,
  },
  cardTop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  cardText: {
    paddingHorizontal: space.md,
  },
  foot: {
    backgroundColor: color.paper,
    borderTopWidth: stroke.regular,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: sizes.buttonLarge + space.md,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  footBar: {
    alignSelf: 'stretch',
    gap: space.hair,
  },
});
