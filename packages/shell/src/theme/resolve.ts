import defaults from './defaultTheme.json';

/**
 * The shape of an app's theme file (apps/<app>/theme.json). Every key is
 * optional: anything an app leaves out falls back to the shell defaults in
 * defaultTheme.json. This module has no React Native imports so build-time
 * code and plain Node tests can use it too.
 */
export type ColorName = keyof (typeof defaults)['colors']['light'];
export type ColorPalette = Record<ColorName, string>;
export type SpacingName = keyof (typeof defaults)['spacing'];
export type RadiusName = keyof (typeof defaults)['radius'];
export type BorderWidthName = keyof (typeof defaults)['borderWidth'];
export type OpacityName = keyof (typeof defaults)['opacity'];
export type FontRole = keyof (typeof defaults)['fonts'];
export type TypographyVariant = keyof (typeof defaults)['typography'];
export type Appearance = 'system' | 'light' | 'dark';
export type FontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

export type TypeStyle = {
  /** Which entry of `fonts` this style uses. */
  font: FontRole;
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
};

/** A complete theme: every token has a value. */
export type ThemeDefinition = {
  appearance: Appearance;
  colors: { light: ColorPalette; dark: ColorPalette };
  /** Font family names, or "system" for the platform's default font. */
  fonts: Record<FontRole, string>;
  /** Font files to embed at build time, relative to the app folder. */
  fontFiles: string[];
  typography: Record<TypographyVariant, TypeStyle>;
  spacing: Record<SpacingName, number>;
  radius: Record<RadiusName, number>;
  borderWidth: Record<BorderWidthName, number>;
  opacity: Record<OpacityName, number>;
};

/** What an app's theme.json may contain: any subset of a ThemeDefinition. */
export type ThemeFile = {
  appearance?: string;
  colors?: { light?: Partial<Record<string, string>>; dark?: Partial<Record<string, string>> };
  fonts?: Partial<Record<string, string>>;
  fontFiles?: string[];
  typography?: Partial<Record<string, Partial<Record<string, string | number>>>>;
  spacing?: Partial<Record<string, number>>;
  radius?: Partial<Record<string, number>>;
  borderWidth?: Partial<Record<string, number>>;
  opacity?: Partial<Record<string, number>>;
};

export const defaultTheme = defaults as ThemeDefinition;

export class ThemeFileError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid theme file:\n- ${problems.join('\n- ')}`);
    this.name = 'ThemeFileError';
  }
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const APPEARANCES: readonly string[] = ['system', 'light', 'dark'];
const WEIGHTS: readonly string[] = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const TOP_LEVEL = Object.keys(defaults);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges an app's theme file over the shell defaults and checks every value.
 * Throws a ThemeFileError listing all problems (unknown token names, bad hex
 * colors, non-positive sizes) so a typo in theme.json fails loudly instead of
 * silently falling back to a default.
 */
export function resolveThemeFile(file: ThemeFile = {}): ThemeDefinition {
  const problems: string[] = [];
  const input = file as Record<string, unknown>;
  if (!isObject(input)) throw new ThemeFileError(['the theme must be a JSON object']);

  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL.includes(key)) problems.push(`unknown section "${key}"`);
  }

  function section<T extends Record<string, unknown>>(
    path: string,
    base: T,
    value: unknown,
    check: (v: unknown, at: string) => string | null,
  ): T {
    if (value === undefined) return { ...base };
    if (!isObject(value)) {
      problems.push(`${path} must be an object`);
      return { ...base };
    }
    const out: Record<string, unknown> = { ...base };
    for (const [name, v] of Object.entries(value)) {
      const at = `${path}.${name}`;
      if (!(name in base)) {
        problems.push(`unknown token ${at} (expected one of: ${Object.keys(base).join(', ')})`);
        continue;
      }
      const problem = check(v, at);
      if (problem) problems.push(problem);
      else out[name] = v;
    }
    return out as T;
  }

  const color = (v: unknown, at: string) =>
    typeof v === 'string' && HEX_COLOR.test(v) ? null : `${at} must be a hex color like "#1A2B3C"`;
  const positive = (v: unknown, at: string) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? null : `${at} must be a number of 0 or more`;
  const fraction = (v: unknown, at: string) =>
    typeof v === 'number' && v >= 0 && v <= 1 ? null : `${at} must be a number from 0 to 1`;
  const fontName = (v: unknown, at: string) =>
    typeof v === 'string' && v.trim() !== '' ? null : `${at} must be a font family name or "system"`;

  let appearance = defaultTheme.appearance;
  if (input.appearance !== undefined) {
    if (typeof input.appearance === 'string' && APPEARANCES.includes(input.appearance)) {
      appearance = input.appearance as Appearance;
    } else {
      problems.push('appearance must be "system", "light" or "dark"');
    }
  }

  const colorsIn = input.colors;
  if (colorsIn !== undefined && !isObject(colorsIn)) problems.push('colors must be an object');
  const colorsObj = isObject(colorsIn) ? colorsIn : {};
  for (const key of Object.keys(colorsObj)) {
    if (key !== 'light' && key !== 'dark') problems.push(`unknown section colors.${key} (expected light or dark)`);
  }
  const colors = {
    light: section('colors.light', defaultTheme.colors.light, colorsObj.light, color),
    dark: section('colors.dark', defaultTheme.colors.dark, colorsObj.dark, color),
  };

  const fonts = section('fonts', defaultTheme.fonts, input.fonts, fontName);

  let fontFiles = defaultTheme.fontFiles;
  if (input.fontFiles !== undefined) {
    if (Array.isArray(input.fontFiles) && input.fontFiles.every((f) => typeof f === 'string')) {
      fontFiles = input.fontFiles as string[];
    } else {
      problems.push('fontFiles must be a list of file paths');
    }
  }

  const typographyIn = input.typography;
  const typography = section('typography', defaultTheme.typography, undefined, () => null);
  if (typographyIn !== undefined) {
    if (!isObject(typographyIn)) problems.push('typography must be an object');
    else {
      for (const [variant, style] of Object.entries(typographyIn)) {
        const base = defaultTheme.typography[variant as TypographyVariant];
        if (!base) {
          problems.push(
            `unknown token typography.${variant} (expected one of: ${Object.keys(defaultTheme.typography).join(', ')})`,
          );
          continue;
        }
        typography[variant as TypographyVariant] = section(`typography.${variant}`, base, style, (v, at) => {
          if (at.endsWith('.font')) {
            return typeof v === 'string' && v in defaultTheme.fonts
              ? null
              : `${at} must be one of: ${Object.keys(defaultTheme.fonts).join(', ')}`;
          }
          if (at.endsWith('.fontWeight')) {
            return typeof v === 'string' && WEIGHTS.includes(v) ? null : `${at} must be "100" to "900" in steps of 100`;
          }
          return positive(v, at);
        });
      }
    }
  }

  const theme: ThemeDefinition = {
    appearance,
    colors,
    fonts,
    fontFiles,
    typography,
    spacing: section('spacing', defaultTheme.spacing, input.spacing, positive),
    radius: section('radius', defaultTheme.radius, input.radius, positive),
    borderWidth: section('borderWidth', defaultTheme.borderWidth, input.borderWidth, positive),
    opacity: section('opacity', defaultTheme.opacity, input.opacity, fraction),
  };

  if (problems.length > 0) throw new ThemeFileError(problems);
  return theme;
}
