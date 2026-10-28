import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration. Values come from environment variables so the
 * same code builds development, preview and production apps. See .env.example
 * and docs/SETUP.md.
 */
const bundleIdentifier = process.env.IOS_BUNDLE_ID ?? 'com.momo0327.relive';
const inviteHost = (process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? '').replace(/^https:\/\//, '').replace(/\/.*$/, '');

const cameraText = 'Relive uses the camera to capture photos and videos for your trip. They stay sealed until the trip ends.';
const micText = 'Relive uses the microphone to record sound with the videos you capture for your trip.';
const photosText = 'Relive opens the photos and videos you choose so you can add them to a trip.';
const savePhotosText = 'Relive saves revealed trip memories to your photo library when you tap Save.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Relive',
  slug: 'relive',
  version: '1.0.0',
  scheme: 'relive',
  orientation: 'default',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0E0F10',
  ios: {
    bundleIdentifier,
    icon: './assets/images/icon.png',
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: inviteHost ? [`applinks:${inviteHost}`] : undefined,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: cameraText,
      NSMicrophoneUsageDescription: micText,
      NSPhotoLibraryUsageDescription: photosText,
      NSPhotoLibraryAddUsageDescription: savePhotosText,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        ['NSPrivacyCollectedDataTypePhotosorVideos', ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
        ['NSPrivacyCollectedDataTypeOtherUserContent', ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
        ['NSPrivacyCollectedDataTypeName', ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
        ['NSPrivacyCollectedDataTypeEmailAddress', ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
        ['NSPrivacyCollectedDataTypeUserID', ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
      ].map(([type, purposes]) => ({
        NSPrivacyCollectedDataType: type as string,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: purposes as string[],
      })),
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? bundleIdentifier,
    adaptiveIcon: {
      backgroundColor: '#0E0F10',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    // White "relive" wordmark on black (reliveSplash.png design), same in light and dark mode.
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', backgroundColor: '#000000', imageWidth: 125 }],
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-web-browser',
    'expo-sharing',
    '@react-native-community/datetimepicker',
    ['expo-camera', { cameraPermission: cameraText, microphonePermission: micText, recordAudioAndroid: true, barcodeScannerEnabled: false }],
    ['expo-image-picker', { photosPermission: photosText, cameraPermission: cameraText, microphonePermission: micText }],
    ['expo-media-library', { photosPermission: photosText, savePhotosPermission: savePhotosText, isAccessMediaLocationEnabled: false, granularPermissions: ['photo', 'video'] }],
    ['expo-video', { supportsPictureInPicture: false, supportsBackgroundPlayback: false }],
    // Local notifications only: no APNs entitlement or push key needed.
    ['expo-notifications', { enableRemoteNotifications: false }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  owner: 'momodev03',
  // EAS Update: JS/asset changes ship instantly to builds with the same app version.
  // Native changes (new packages, permissions, icon/splash) need a new build and version bump.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/179231f1-f3ed-4551-b420-cfdf07c3feca' },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '179231f1-f3ed-4551-b420-cfdf07c3feca' },
  },
});
