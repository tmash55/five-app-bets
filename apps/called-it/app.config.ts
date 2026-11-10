import type { ExpoConfig } from 'expo/config';

import baseColors from '../../packages/shell/src/theme/palette.json';
import identity from './app.identity.json';
import { readShareConfig } from './src/share/shareConfig.ts';

// Invite links (UNJ-1425): with a host set, https://<host>/join/<code> opens the
// app (universal links on iOS, verified app links on Android). See invite-site/.
const { inviteHost } = readShareConfig(process.env);

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
    ...(inviteHost ? { associatedDomains: [`applinks:${inviteHost}`] } : {}),
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
    ...(inviteHost
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [{ scheme: 'https', host: inviteHost, pathPrefix: '/join/' }],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
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
    // Share cards (UNJ-1425): let the app check for and open Instagram Stories and X.
    [
      'react-native-share',
      {
        ios: ['instagram-stories', 'instagram', 'twitter'],
        android: ['com.instagram.android', 'com.twitter.android'],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
