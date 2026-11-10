import { Text, useTheme, type ColorName } from '@five/shell';
import { View } from 'react-native';

import {
  crowdLine,
  rowDetail,
  rowStatus,
  STATUS_LABEL,
  type ResultPick,
  type ResultQuestion,
  type RowStatus,
} from '../results/resultsState';

const STATUS_COLOR: Record<RowStatus, ColorName> = {
  correct: 'success',
  wrong: 'danger',
  void: 'textSecondary',
  pending: 'textSecondary',
  no_pick: 'textSecondary',
};

/** One graded question on the Results screen (UNJ-1423). */
export function ResultRow({ question: q, pick }: { question: ResultQuestion; pick: ResultPick | undefined }) {
  const theme = useTheme();
  const status = rowStatus(q, pick);
  const crowd = status === 'void' ? null : crowdLine(q, pick?.answer);
  return (
    <View
      accessibilityLabel={`Question ${q.position}, ${STATUS_LABEL[status]}`}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.xs,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <Text variant="caption" color="textSecondary">
          {`${q.sport.toUpperCase()} · ${q.game_label}`}
        </Text>
        <Text variant="label" color={STATUS_COLOR[status]}>
          {STATUS_LABEL[status]}
        </Text>
      </View>
      <Text variant="body">{q.prompt}</Text>
      <Text variant="caption" color="textSecondary">
        {rowDetail(q, pick)}
      </Text>
      {crowd ? (
        <Text variant="caption" color="textSecondary">
          {crowd}
        </Text>
      ) : null}
    </View>
  );
}
