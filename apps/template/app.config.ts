import type { ExpoConfig } from 'expo/config';

import baseColors from '../../packages/shell/src/theme/palette.json';
import identity from './app.identity.json';

// Set in EAS (or .env.local) once the app has an EAS project and Firebase app.
// Push tokens need the EAS project ID; Android pushes need google-services.json.
const easProjectId = process.env.EAS_PROJECT_ID?.trim() || undefined;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || undefined;

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
    ...(googleServicesFile ? { googleServicesFile } : {}),
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
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: baseColors.light.primary,
        defaultChannel: 'updates',
      },
    ],
    '@react-native-community/datetimepicker',
  ],
  extra: easProjectId ? { eas: { projectId: easProjectId } } : {},
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
