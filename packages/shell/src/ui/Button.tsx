import { ActivityIndicator, Pressable } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const background =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.surface;
  const textColor = variant === 'secondary' ? 'text' : 'textOnPrimary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: background,
        borderRadius: theme.radius.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        opacity: inactive ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
      })}>
      {loading ? (
        <ActivityIndicator color={theme.colors[textColor]} />
      ) : (
        <Text variant="label" color={textColor}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
