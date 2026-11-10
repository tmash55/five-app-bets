import type { ExpoConfig } from 'expo/config';

import defaultTheme from '../../packages/shell/src/theme/defaultTheme.json';
import identity from './app.identity.json';
import theme from './theme.json';

/**
 * Per-app identity (name, slug, bundle IDs) lives in app.identity.json so
 * `npm run new-app` can rewrite it without touching this file. The app's look
 * lives in theme.json; the splash, icon background, light/dark setting and
 * embedded fonts below are read from it at build time.
 */
type Scheme = 'light' | 'dark';
type ColorName = keyof typeof defaultTheme.colors.light;
type PartialTheme = {
  appearance?: string;
  colors?: Partial<Record<Scheme, Partial<Record<ColorName, string>>>>;
  fontFiles?: string[];
};
const appTheme: PartialTheme = theme;

function color(scheme: Scheme, name: ColorName): string {
  return appTheme.colors?.[scheme]?.[name] ?? defaultTheme.colors[scheme][name];
}

const interfaceStyle = { light: 'light', dark: 'dark' } as const;
const fontFiles = appTheme.fontFiles ?? [];

const config: ExpoConfig = {
  name: identity.name,
  slug: identity.slug,
  scheme: identity.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle:
    appTheme.appearance === 'light' || appTheme.appearance === 'dark'
      ? interfaceStyle[appTheme.appearance]
      : 'automatic',
  ios: {
    bundleIdentifier: identity.iosBundleIdentifier,
    supportsTablet: false,
  },
  android: {
    package: identity.androidPackage,
    adaptiveIcon: {
      backgroundColor: color('light', 'surface'),
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: color('light', 'primary'),
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
        dark: { backgroundColor: color('dark', 'primary') },
      },
    ],
    ...(fontFiles.length > 0 ? [['expo-font', { fonts: fontFiles }] as [string, unknown]] : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
