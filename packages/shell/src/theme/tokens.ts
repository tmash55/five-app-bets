import { Platform, type TextStyle } from 'react-native';

import {
  defaultTheme,
  resolveThemeFile,
  type ColorPalette,
  type FontRole,
  type ThemeDefinition,
  type ThemeFile,
  type TypographyVariant,
} from './resolve';

export * from './resolve';

/**
 * Design tokens for shell apps. Each app's look comes from one file,
 * apps/<app>/theme.json, merged over the shell defaults in defaultTheme.json.
 * Screens read colors, fonts, spacing, radius, border widths and opacity from
 * `useTheme()` and never hard-code them.
 */
export const baseColors = defaultTheme.colors;

export type Scheme = 'light' | 'dark';

export type Theme = {
  scheme: Scheme;
  colors: ColorPalette;
  /** Resolved font family per role, with "system" mapped to the platform font. */
  fonts: Record<FontRole, string | undefined>;
  /** Ready-to-use text styles, including fontFamily. */
  typography: Record<TypographyVariant, TextStyle>;
  spacing: ThemeDefinition['spacing'];
  radius: ThemeDefinition['radius'];
  borderWidth: ThemeDefinition['borderWidth'];
  opacity: ThemeDefinition['opacity'];
};

const SYSTEM_FONTS: Record<FontRole, string | undefined> = {
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: undefined }),
  heading: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: undefined }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

function fontFamily(role: FontRole, name: string): string | undefined {
  return name === 'system' ? SYSTEM_FONTS[role] : name;
}

/** Which scheme to render, given the theme's appearance setting and the device setting. */
export function schemeFor(definition: ThemeDefinition, deviceScheme: string | null | undefined): Scheme {
  if (definition.appearance !== 'system') return definition.appearance;
  return deviceScheme === 'dark' ? 'dark' : 'light';
}

/** Builds the theme screens read for one scheme from a theme file or a resolved definition. */
export function buildTheme(scheme: Scheme, source: ThemeFile | ThemeDefinition = defaultTheme): Theme {
  const definition = resolveThemeFile(source as ThemeFile);
  const fonts = {
    body: fontFamily('body', definition.fonts.body),
    heading: fontFamily('heading', definition.fonts.heading),
    mono: fontFamily('mono', definition.fonts.mono),
  };
  const typography = Object.fromEntries(
    Object.entries(definition.typography).map(([variant, { font, ...style }]) => [
      variant,
      { ...style, fontFamily: fonts[font] },
    ]),
  ) as Record<TypographyVariant, TextStyle>;

  return {
    scheme,
    colors: definition.colors[scheme],
    fonts,
    typography,
    spacing: definition.spacing,
    radius: definition.radius,
    borderWidth: definition.borderWidth,
    opacity: definition.opacity,
  };
}
