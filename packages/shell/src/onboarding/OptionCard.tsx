import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../ui/Text';
import type { ChoiceOption } from './types';

/** One answer option. Radio for single choice, checkbox for multiple choice. */
export function OptionCard({
  option,
  selected,
  multiple,
  disabled,
  onPress,
}: {
  option: ChoiceOption;
  selected: boolean;
  multiple: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const markSize = theme.spacing.lg - theme.spacing.xs;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={multiple ? { checked: selected, disabled } : { selected, disabled }}
      accessibilityLabel={
        option.description ? `${option.label}. ${option.description}` : option.label
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: 2,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}>
      <View
        style={{
          width: markSize,
          height: markSize,
          borderRadius: multiple ? theme.radius.sm : theme.radius.pill,
          borderWidth: 2,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected ? (
          <View
            style={{
              width: theme.spacing.sm,
              height: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.textOnPrimary,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="label">{option.label}</Text>
        {option.description ? (
          <Text variant="caption" color="textSecondary">
            {option.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
