import type { ExpoConfig } from 'expo/config';

import baseColors from '../../packages/shell/src/theme/palette.json';
import identity from './app.identity.json';

/**
 * Per-app identity (name, slug, bundle IDs) lives in app.identity.json so
 * `npm run new-app` can rewrite it without touching this file.
 */
const config: ExpoConfig = {
  name: identity.name,
  slug: identity.slug,
  scheme: identity.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: identity.iosBundleIdentifier,
    supportsTablet: false,
  },
  android: {
    package: identity.androidPackage,
    adaptiveIcon: {
      backgroundColor: baseColors.light.surface,
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
        backgroundColor: baseColors.light.primary,
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
