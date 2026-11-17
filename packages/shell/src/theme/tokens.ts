import { Platform } from 'react-native';

import palette from './palette.json';

/**
 * Base design tokens for every shell app. Raw colors live in palette.json so
 * app.config.ts can read them at build time. Screens must read colors, fonts and
 * spacing from these tokens (through `useTheme`) and never hard-code values.
 * Per-app overrides are passed to `ThemeProvider` (see UNJ-1420).
 */
export const baseColors = palette;

export type ColorName = keyof (typeof palette)['light'];
export type ColorPalette = Record<ColorName, string>;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 64,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontFamilies = {
  body: Platform.select({ ios: 'System', default: 'sans-serif' }),
  heading: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export const typography = {
  title: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: typeof radius;
  fonts: typeof fontFamilies;
  typography: typeof typography;
};

export type ThemeOverrides = {
  light?: Partial<ColorPalette>;
  dark?: Partial<ColorPalette>;
};

export function buildTheme(scheme: 'light' | 'dark', overrides?: ThemeOverrides): Theme {
  return {
    scheme,
    colors: { ...baseColors[scheme], ...overrides?.[scheme] },
    spacing,
    radius,
    fonts: fontFamilies,
    typography,
  };
}
