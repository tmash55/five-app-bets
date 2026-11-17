import { Text, useTheme } from '@five/shell';
import type { ComponentRef, Ref } from 'react';
import { View } from 'react-native';

import type { ResultsCard } from '../share/resultsCard';

/** Stories size: 9:16. The card is captured at 1080 x 1920 whatever size it shows at. */
export const CARD_ASPECT = 9 / 16;
export const CARD_PIXELS = { width: 1080, height: 1920 } as const;

export type CardHandle = ComponentRef<typeof View>;

type Props = {
  ref?: Ref<CardHandle>;
  card: ResultsCard;
  /** The invite line printed at the bottom, for people who only see the picture. */
  leagueName: string | null;
  link: string | null;
  width: number;
};

/**
 * The shareable results card (UNJ-1425): record for the night, points, best
 * pick, streak and the league invite. Every color, font and space comes from
 * the theme, so each app's tokens restyle it.
 */
export function ResultsCardView({ card, leagueName, link, width, ref }: Props) {
  const theme = useTheme();
  return (
    <View
      ref={ref}
      collapsable={false}
      accessibilityLabel={`Results card: ${card.headline}, ${card.record}, ${card.points} points`}
      style={{
        width,
        height: width / CARD_ASPECT,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" color="textOnPrimary">
          CALLED IT
        </Text>
        <Text variant="caption" color="textOnPrimary">
          {card.dateLabel.toUpperCase()}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading" color="textOnPrimary">
          {card.displayName ? `${card.displayName} went` : 'I went'}
        </Text>
        <Text variant="title" color="textOnPrimary" adjustsFontSizeToFit numberOfLines={1}>
          {card.record}
        </Text>
        <Text variant="heading" color="textOnPrimary">
          {card.headline}
        </Text>
        <Text variant="label" color="textOnPrimary">
          {`${card.points} pts${card.bonus ? ` · ${card.bonus} bonus` : ''}${card.streak ? ` · ${card.streak}` : ''}`}
        </Text>
      </View>

      {card.bestPick ? (
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}>
          <Text variant="caption" color="textSecondary">
            BEST CALL
          </Text>
          <Text variant="label" numberOfLines={3}>
            {card.bestPick.prompt}
          </Text>
          <Text variant="caption" color="success">
            {`Picked ${card.bestPick.answer} · +${card.bestPick.points} pts`}
          </Text>
          {card.bestPick.crowd ? (
            <Text variant="caption" color="textSecondary">
              {card.bestPick.crowd}
            </Text>
          ) : null}
        </View>
      ) : (
        <View />
      )}

      <View style={{ gap: theme.spacing.xxs }}>
        {leagueName ? (
          <Text variant="label" color="textOnPrimary" numberOfLines={2}>
            {`Beat me in "${leagueName}"`}
          </Text>
        ) : null}
        {link ? (
          <Text variant="caption" color="textOnPrimary" numberOfLines={1} adjustsFontSizeToFit>
            {link}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
