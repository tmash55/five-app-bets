import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import type { ColorName, TypographyVariant } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorName;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      style={[theme.typography[variant], { color: theme.colors[color] }, style]}
      {...rest}
    />
  );
}
