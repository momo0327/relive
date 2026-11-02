import { Poppins_500Medium } from '@expo-google-fonts/poppins';
import { ProtestStrike_400Regular, useFonts } from '@expo-google-fonts/protest-strike';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { applyStoredAppearance } from '@/lib/appearance';
import { tripIdFromResponse } from '@/lib/notifications';
import { SessionProvider, useSession } from '@/lib/session';
import { UploadQueueProvider } from '@/lib/uploads';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();
applyStoredAppearance();

export default function RootLayout() {
  return (
    <SessionProvider>
      <UploadQueueProvider>
        <AppStack />
      </UploadQueueProvider>
    </SessionProvider>
  );
}

/** Tapping a reminder or reveal notification opens that trip. */
function useNotificationNavigation(enabled: boolean) {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const tripId = tripIdFromResponse(last);
    if (!enabled || !tripId) return;
    router.push(`/trips/${tripId}`);
    Notifications.clearLastNotificationResponse();
  }, [enabled, last, router]);
}

function AppStack() {
  const { ready, signedIn, onboarded } = useSession();
  useNotificationNavigation(ready && signedIn && onboarded);
  const c = useTheme();
  // Trip cards use Protest Strike (title) and Poppins Medium (date), both SIL OFL;
  // a load failure falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({ ProtestStrike_400Regular, Poppins_500Medium });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready && fontsReady) SplashScreen.hideAsync();
  }, [ready, fontsReady]);

  if (!ready || !fontsReady) return null;

  const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.background, card: c.background, text: c.text, primary: c.accent, border: c.border },
  };
  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: c.background },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: c.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.background },
        }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="email-sign-in" options={{ ...sheet, title: 'Sign in with email', sheetAllowedDetents: [1] }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen
            name="index"
            // The visible "Memories" heading is drawn in the page itself (see index.tsx).
            options={{ title: 'Memories', headerTitle: '', headerTransparent: true }}
          />
          <Stack.Screen name="join-link" options={{ ...sheet, title: 'Join a Trip', sheetAllowedDetents: [0.55, 1] }} />
          <Stack.Screen name="trips/new" options={{ ...sheet, title: 'New Trip', headerShown: true, sheetAllowedDetents: [1] }} />
          <Stack.Screen name="trips/[id]/index" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="trips/[id]/invite" options={{ ...sheet, headerShown: false, sheetAllowedDetents: 'fitToContents' }} />
          <Stack.Screen name="trips/[id]/edit" options={{ ...sheet, title: 'Edit Trip', sheetAllowedDetents: [1] }} />
          <Stack.Screen name="trips/[id]/options" options={{ ...sheet, title: 'Trip Options', sheetAllowedDetents: [0.7, 1] }} />
          <Stack.Screen name="trips/[id]/saved" options={{ ...sheet, headerShown: false, sheetAllowedDetents: 'fitToContents' }} />
          <Stack.Screen name="trips/[id]/capture" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="trips/[id]/viewer" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
          <Stack.Screen name="account" options={{ title: 'Settings' }} />
          <Stack.Screen name="profile" options={{ ...sheet, title: 'Edit Profile', sheetAllowedDetents: [1] }} />
        </Stack.Protected>

        <Stack.Screen name="join/[token]" options={{ title: 'Join Trip' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="dev-preview" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
