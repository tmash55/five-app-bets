import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** A boxed message, used for "not configured" and error states. */
export function Notice({ title, body, tone = 'info' }: { title: string; body?: string; tone?: 'info' | 'error' }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: tone === 'error' ? theme.colors.danger : theme.colors.border,
        borderWidth: theme.borderWidth.thin,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: theme.spacing.xs,
      }}>
      <Text variant="label" color={tone === 'error' ? 'danger' : 'text'}>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" color="textSecondary">
          {body}
        </Text>
      ) : null}
    </View>
  );
}
