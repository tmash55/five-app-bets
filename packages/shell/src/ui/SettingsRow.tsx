import { ActivityIndicator, Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type SettingsRowProps = {
  label: string;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

export function SettingsRow({ label, detail, onPress, destructive, loading, disabled }: SettingsRowProps) {
  const theme = useTheme();
  const inactive = disabled || loading || !onPress;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled: Boolean(inactive) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text color={destructive ? 'danger' : 'text'}>{label}</Text>
        {detail ? (
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
      {loading ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
    </Pressable>
  );
}

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="label" color="textSecondary">
        {title}
      </Text>
      <View
        style={{
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          gap: 1,
          backgroundColor: theme.colors.border,
        }}>
        {children}
      </View>
    </View>
  );
}
