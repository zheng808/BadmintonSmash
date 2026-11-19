import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'BadmintonSmash',
  slug: 'badmintonsmash',
  version: '0.1.0',
  scheme: 'badmintonsmash',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.badmintonsmash.app',
    supportsTablet: true,
    icon: './assets/expo.icon',
  },
  android: {
    package: 'com.badmintonsmash.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#1B5E3B', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    'expo-secure-store',
  ],
  experiments: { typedRoutes: true },
  extra: { eas: {} },
};

export default config;
