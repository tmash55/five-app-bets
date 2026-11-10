import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  baseColors,
  buildTheme,
  defaultTheme,
  resolveThemeFile,
  schemeFor,
  ThemeFileError,
} from '../theme/tokens';

describe('resolveThemeFile', () => {
  it('returns the shell defaults for an empty file', () => {
    expect(resolveThemeFile({})).toEqual(defaultTheme);
  });

  it('merges a partial theme over the defaults, token by token', () => {
    const theme = resolveThemeFile({
      colors: { dark: { primary: '#123456' } },
      spacing: { md: 20 },
      typography: { title: { fontSize: 40 } },
      fonts: { heading: 'Fraunces-Bold' },
    });
    expect(theme.colors.dark.primary).toBe('#123456');
    expect(theme.colors.dark.background).toBe(defaultTheme.colors.dark.background);
    expect(theme.colors.light.primary).toBe(defaultTheme.colors.light.primary);
    expect(theme.spacing).toEqual({ ...defaultTheme.spacing, md: 20 });
    expect(theme.typography.title).toEqual({ ...defaultTheme.typography.title, fontSize: 40 });
    expect(theme.fonts.heading).toBe('Fraunces-Bold');
  });

  it('lists every problem in a bad theme file instead of silently ignoring it', () => {
    const bad = {
      colours: {},
      appearance: 'sepia',
      colors: { light: { primay: '#123456', text: 'red' } },
      spacing: { md: -4 },
      opacity: { pressed: 2 },
      typography: { title: { font: 'script', fontWeight: 'bold' } },
    };
    let error: unknown;
    try {
      resolveThemeFile(bad);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ThemeFileError);
    const problems = (error as ThemeFileError).problems.join('\n');
    expect(problems).toContain('unknown section "colours"');
    expect(problems).toContain('appearance');
    expect(problems).toContain('colors.light.primay');
    expect(problems).toContain('colors.light.text must be a hex color');
    expect(problems).toContain('spacing.md');
    expect(problems).toContain('opacity.pressed');
    expect(problems).toContain('typography.title.font');
    expect(problems).toContain('typography.title.fontWeight');
  });
});

describe('buildTheme', () => {
  it('uses the colors of the requested scheme', () => {
    const file = { colors: { dark: { primary: '#123456' }, light: { primary: '#654321' } } };
    expect(buildTheme('dark', file).colors.primary).toBe('#123456');
    expect(buildTheme('light', file).colors.primary).toBe('#654321');
  });

  it('puts the right font family on each text style', () => {
    const theme = buildTheme('light', { fonts: { heading: 'Display', body: 'Reading' } });
    expect(theme.typography.title.fontFamily).toBe('Display');
    expect(theme.typography.heading.fontFamily).toBe('Display');
    expect(theme.typography.body.fontFamily).toBe('Reading');
    expect(theme.typography.caption).not.toHaveProperty('font');
  });

  it('keeps light and dark palettes in sync', () => {
    expect(Object.keys(baseColors.dark).sort()).toEqual(Object.keys(baseColors.light).sort());
  });
});

describe('schemeFor', () => {
  it('follows the device unless the theme forces light or dark', () => {
    expect(schemeFor(resolveThemeFile({}), 'dark')).toBe('dark');
    expect(schemeFor(resolveThemeFile({}), null)).toBe('light');
    expect(schemeFor(resolveThemeFile({ appearance: 'dark' }), 'light')).toBe('dark');
    expect(schemeFor(resolveThemeFile({ appearance: 'light' }), 'dark')).toBe('light');
  });
});

describe('theme tokens rule', () => {
  // Look and feel must come from theme tokens, never hard-coded in components.
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }
  const components = sourceFiles(join(__dirname, '..')).filter((file) => !file.includes(`${join('src', 'theme')}`));

  it('has no hex or rgb colors outside the theme folder', () => {
    const offenders = components.filter((file) =>
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('has no hard-coded font sizes, font families, spacing or corner radius outside the theme folder', () => {
    const literal =
      /\b(fontSize|lineHeight|fontFamily|letterSpacing|borderRadius|padding\w*|margin\w*|gap|rowGap|columnGap):\s*['"\d]/;
    const offenders = components.filter((file) => literal.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
