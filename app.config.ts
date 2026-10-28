import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration. Values come from environment variables so the
 * same code builds development, preview and production apps. See .env.example
 * and docs/SETUP.md.
 */
const bundleIdentifier = process.env.IOS_BUNDLE_ID ?? 'com.example.l8r';
const inviteHost = (process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? '').replace(/^https:\/\//, '').replace(/\/.*$/, '');

const cameraText = 'L8R uses the camera to capture photos and videos for your trip. They stay sealed until the trip ends.';
const micText = 'L8R uses the microphone to record sound with the videos you capture for your trip.';
const photosText = 'L8R opens the photos and videos you choose so you can add them to a trip.';
const savePhotosText = 'L8R saves revealed trip memories to your photo library when you tap Save.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'L8R',
  slug: 'l8r',
  version: '1.0.0',
  scheme: 'l8r',
  orientation: 'default',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B0B0F',
  ios: {
    bundleIdentifier,
    icon: './assets/expo.icon',
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
      backgroundColor: '#0B0B0F',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#0B0B0F', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-web-browser',
    'expo-sharing',
    '@react-native-community/datetimepicker',
    ['expo-camera', { cameraPermission: cameraText, microphonePermission: micText, recordAudioAndroid: true, barcodeScannerEnabled: false }],
    ['expo-image-picker', { photosPermission: photosText, cameraPermission: cameraText, microphonePermission: micText }],
    ['expo-media-library', { photosPermission: photosText, savePhotosPermission: savePhotosText, isAccessMediaLocationEnabled: false, granularPermissions: ['photo', 'video'] }],
    ['expo-video', { supportsPictureInPicture: false, supportsBackgroundPlayback: false }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
