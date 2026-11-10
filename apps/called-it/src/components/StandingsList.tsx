import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { rankLabel, recordLabel, type StandingRow } from '../compete/standings';

/** A ranked table of players: place, name, record and points. The player's own row is highlighted. */
export function StandingsList({ rows, emptyText }: { rows: StandingRow[]; emptyText: string }) {
  const theme = useTheme();
  if (rows.length === 0) {
    return <Text color="textSecondary">{emptyText}</Text>;
  }
  // The player's own row can come after a gap when they are outside the top of the board.
  return (
    <View style={{ borderRadius: theme.radius.md, overflow: 'hidden', gap: 1, backgroundColor: theme.colors.border }}>
      {rows.map((row, i) => {
        // Everyone with more points is listed above, so a rank past i + 1 means rows were left out.
        const gap = i > 0 && row.rank > i + 1;
        const place = rankLabel(row, rows);
        return (
          <View key={row.user_id}>
            {gap ? (
              <View style={{ backgroundColor: theme.colors.surface, paddingVertical: theme.spacing.xs, alignItems: 'center' }}>
                <Text variant="caption" color="textSecondary">
                  ···
                </Text>
              </View>
            ) : null}
            <View
              accessibilityLabel={`${place}, ${row.display_name}${row.is_me ? ' (you)' : ''}, ${row.points} points`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: row.is_me ? theme.colors.surfaceSelected : theme.colors.surface,
              }}>
              <Text variant="label" color="textSecondary" style={{ minWidth: theme.spacing.xl + theme.spacing.sm }}>
                {place}
              </Text>
              <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                <Text variant="label" numberOfLines={1}>
                  {row.is_me ? `${row.display_name} (you)` : row.display_name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`${recordLabel(row.correct, row.graded)}${row.is_owner ? ' · Owner' : ''}`}
                </Text>
              </View>
              <Text variant="label">{`${row.points} pts`}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
