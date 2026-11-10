import { defaultTheme, resolveThemeFile } from '@five/shell';

import config from '../app.config';
import theme from '../theme.json';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-purchases', () => ({}));

describe('theme.json', () => {
  it('is a valid theme file', () => {
    expect(() => resolveThemeFile(theme)).not.toThrow();
  });

  it('lists every token, so new apps copied from the template show every knob', () => {
    const keysOf = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, `${prefix}${key}.`) : [`${prefix}${key}`],
      );
    expect(keysOf(theme).sort()).toEqual(keysOf(defaultTheme).sort());
  });

  it('drives the splash and icon colors in app.config', () => {
    const splash = config.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen') as [
      string,
      { backgroundColor: string; dark: { backgroundColor: string } },
    ];
    expect(splash[1].backgroundColor).toBe(theme.colors.light.primary);
    expect(splash[1].dark.backgroundColor).toBe(theme.colors.dark.primary);
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe(theme.colors.light.surface);
    expect(config.userInterfaceStyle).toBe('automatic');
  });
});
