import { render, screen } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { readShellConfig } from '../config/env';
import { SignUpScreen } from '../screens/AuthForm';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShellProviders } from '../ShellProviders';
import { defaultTheme, resolveThemeFile } from '../theme/tokens';
import { Button } from '../ui/Button';
import altTheme from './fixtures/altTheme.json';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-purchases', () => ({}));

/**
 * "Done when swapping one theme file changes the whole look of a test app."
 * Renders the shell screens with a theme file whose every value differs from
 * the defaults, then checks that every color, font, size, spacing and radius
 * on screen came from that file and none from the defaults.
 */
type Found = { colors: string[]; fonts: string[]; numbers: Record<string, number[]> };

const SIZE_KEYS = ['fontSize', 'lineHeight', 'borderRadius', 'borderWidth', 'gap', 'rowGap', 'columnGap'];
const isSpacingKey = (key: string) => /^(padding|margin)/.test(key);

function collect(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null, found: Found) {
  if (!node || typeof node === 'string') return;
  if (Array.isArray(node)) return node.forEach((child) => collect(child, found));
  const style = StyleSheet.flatten(node.props.style) ?? {};
  const values: Record<string, unknown> = { ...style, color: node.props.color ?? style.color };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.startsWith('#')) found.colors.push(value);
    if (key === 'fontFamily' && typeof value === 'string') found.fonts.push(value);
    if (typeof value === 'number' && (SIZE_KEYS.includes(key) || isSpacingKey(key))) {
      (found.numbers[key] ??= []).push(value);
    }
  }
  if (typeof node.props.placeholderTextColor === 'string') found.colors.push(node.props.placeholderTextColor);
  collect(node.children as ReactTestRendererJSON[] | null, found);
}

async function renderShell(theme: object) {
  const config = readShellConfig({});
  await render(
    <ShellProviders config={config} theme={theme}>
      <SignUpScreen onGoToSignIn={() => {}} />
      <SettingsScreen appName="Test App" appVersion="1.0.0" />
      <Button title="Secondary" variant="secondary" onPress={() => {}} />
      <Button title="Danger" variant="danger" onPress={() => {}} />
    </ShellProviders>,
  );
  const found: Found = { colors: [], fonts: [], numbers: {} };
  collect(screen.toJSON(), found);
  return found;
}

describe('swapping the theme file', () => {
  const alt = resolveThemeFile(altTheme);
  const altColors = Object.values(alt.colors.dark);
  const defaultColors = [...Object.values(defaultTheme.colors.light), ...Object.values(defaultTheme.colors.dark)];

  it('uses a test theme that shares no values with the defaults', () => {
    expect(altColors.filter((c) => defaultColors.includes(c))).toEqual([]);
    expect(Object.values(alt.spacing).filter((n) => Object.values(defaultTheme.spacing).includes(n))).toEqual([]);
  });

  it('changes every color, font, text size, spacing, border and radius on the shell screens', async () => {
    const found = await renderShell(altTheme);

    expect(found.colors.length).toBeGreaterThan(5);
    expect(found.colors.filter((c) => !altColors.includes(c))).toEqual([]);

    expect(found.fonts.length).toBeGreaterThan(0);
    expect([...new Set(found.fonts)].sort()).toEqual(['AltBody', 'AltHeading']);

    const typeSizes = Object.values(alt.typography);
    expect(found.numbers.fontSize?.every((n) => typeSizes.some((t) => t.fontSize === n))).toBe(true);
    expect(found.numbers.lineHeight?.every((n) => typeSizes.some((t) => t.lineHeight === n))).toBe(true);

    const radii = Object.values(alt.radius);
    expect(found.numbers.borderRadius?.every((n) => radii.includes(n))).toBe(true);
    const borders = Object.values(alt.borderWidth);
    expect(found.numbers.borderWidth?.every((n) => borders.includes(n))).toBe(true);

    // 0 comes from safe-area insets and keyboard avoidance, not from the theme.
    const spacing = [0, ...Object.values(alt.spacing), ...borders];
    for (const [key, numbers] of Object.entries(found.numbers)) {
      if (key === 'gap' || isSpacingKey(key)) {
        expect({ key, off: numbers.filter((n) => !spacing.includes(n)) }).toEqual({ key, off: [] });
      }
    }
  });

  it('renders the default look when the app has no theme file', async () => {
    const found = await renderShell({});
    expect(found.colors.length).toBeGreaterThan(5);
    expect(found.colors.filter((c) => !Object.values(defaultTheme.colors.light).includes(c))).toEqual([]);
  });

  it('throws a readable error for a theme file with a typo', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderShell({ colors: { light: { primay: '#123456' } } })).rejects.toThrow(
      'unknown token colors.light.primay',
    );
  });
});
