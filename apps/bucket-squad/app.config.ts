import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import identity from './app.identity.json';
import brand from './src/theme/brand.json';

/**
 * A private roster pack (real pro players, for a family build only) is picked
 * up when `private/roster/index.ts` exists on the build machine. The folder is
 * gitignored, so store and CI builds never contain it. The flag below only
 * drives the "family build" badge in Settings.
 */
const hasPrivateRoster =
  process.env.BUCKET_SQUAD_PUBLIC !== '1' && fs.existsSync(path.join(__dirname, 'private', 'roster', 'index.ts'));

const config: ExpoConfig = {
  name: identity.name,
  slug: identity.slug,
  scheme: identity.scheme,
  version: '1.0.0',
  orientation: 'landscape',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: brand.splash,
  ios: {
    bundleIdentifier: identity.iosBundleIdentifier,
    supportsTablet: true,
    requireFullScreen: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIStatusBarHidden: true,
      UIViewControllerBasedStatusBarAppearance: false,
    },
  },
  android: {
    package: identity.androidPackage,
    adaptiveIcon: {
      backgroundColor: brand.iconBackground,
      backgroundImage: './assets/images/android-icon-background.png',
      foregroundImage: './assets/images/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: brand.splash,
        image: './assets/images/splash-icon.png',
        // the lit sign and the game's name; the first second of the app draws the same picture this size (src/ui/arcade/Boot.tsx)
        imageWidth: brand.splashWidth,
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
      },
    ],
    'expo-font',
    'expo-asset',
    'expo-image',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    privateRoster: hasPrivateRoster,
  },
};

export default config;
