import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { baseColors, buildTheme } from '../theme/tokens';

describe('buildTheme', () => {
  it('applies per-app color overrides for the active scheme only', () => {
    const theme = buildTheme('dark', { dark: { primary: '#123456' }, light: { primary: '#654321' } });
    expect(theme.colors.primary).toBe('#123456');
    expect(theme.colors.background).toBe(baseColors.dark.background);
  });

  it('keeps light and dark palettes in sync', () => {
    expect(Object.keys(baseColors.dark).sort()).toEqual(Object.keys(baseColors.light).sort());
  });
});

describe('theme tokens rule', () => {
  // Colors must come from tokens.ts, never hard-coded in components.
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it('has no hex colors outside theme/tokens.ts', () => {
    const offenders = sourceFiles(join(__dirname, '..'))
      .filter((file) => !file.endsWith(join('theme', 'tokens.ts')))
      .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
