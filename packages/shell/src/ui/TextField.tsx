import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type TextFieldProps = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          theme.typography.body,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            fontFamily: theme.fonts.body,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
