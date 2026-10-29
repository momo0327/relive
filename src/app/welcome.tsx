import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { config } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { CancelledError, useSession } from '@/lib/session';
import { useLayout } from '@/ui/layout';
import { Button, Txt } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

export default function Welcome() {
  const c = useTheme();
  const { readableWidth } = useLayout();
  const { signInWithApple, signInWithGoogle, startPreview, pendingInvite } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  async function run(kind: 'apple' | 'google', fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
    } catch (error) {
      if (!(error instanceof CancelledError)) {
        Alert.alert('Couldn’t sign in', friendlyError(error, 'Please try again.'));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <LinearGradient
        colors={c.scheme === 'dark' ? ['#1D1830', c.background] : ['#E9E3F5', c.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={{ width: readableWidth, flex: 1, justifyContent: 'space-between', gap: space.xxl }}>
            <View style={{ gap: space.md, paddingTop: space.xxxl }}>
              <Txt variant="hero" style={{ fontSize: 64, lineHeight: 70 }} accessibilityRole="header">
                Relive
              </Txt>
              <Txt variant="title2">Capture now. Relive later.</Txt>
              <Txt variant="body" tone="secondary">
                A private camera roll for your trip. Everyone adds photos and videos, nobody sees them until the trip
                ends, then they all unlock together.
              </Txt>
            </View>

            <View style={{ gap: space.md }}>
              {pendingInvite ? (
                <Txt variant="callout" tone="accent" style={{ textAlign: 'center' }}>
                  Sign in to join the trip you were invited to.
                </Txt>
              ) : null}
              {!config.hasBackend ? (
                <Txt variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                  Sign-in isn’t configured in this build. You can explore with sample trips.
                </Txt>
              ) : null}

              {Platform.OS === 'ios' && config.hasBackend ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={
                    c.scheme === 'dark'
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={radius.pill}
                  style={{ height: 52, opacity: busy ? 0.5 : 1 }}
                  onPress={() => (busy ? undefined : run('apple', signInWithApple))}
                />
              ) : null}
              {config.hasBackend && config.googleEnabled ? (
                <Button
                  title="Continue with Google"
                  kind="secondary"
                  loading={busy === 'google'}
                  disabled={busy !== null}
                  onPress={() => run('google', signInWithGoogle)}
                />
              ) : null}
              <Button
                title={config.hasBackend ? 'Look around first' : 'Explore with sample trips'}
                kind={config.hasBackend ? 'plain' : 'primary'}
                onPress={startPreview}
                disabled={busy !== null}
                accessibilityHint="Opens a preview with sample trips. Nothing is saved."
              />

              {config.hasBackend && config.emailSignIn ? (
                <Txt
                  variant="footnote"
                  tone="tertiary"
                  style={{ textAlign: 'center' }}
                  accessibilityRole="link"
                  onPress={() => (busy ? undefined : router.push('/email-sign-in'))}>
                  Sign in with email
                </Txt>
              ) : null}

              <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                By continuing you agree to the{' '}
                <Txt variant="caption" tone="secondary" onPress={() => config.termsUrl && WebBrowser.openBrowserAsync(config.termsUrl)} style={{ textDecorationLine: 'underline' }}>
                  Terms
                </Txt>{' '}
                and{' '}
                <Txt variant="caption" tone="secondary" onPress={() => config.privacyPolicyUrl && WebBrowser.openBrowserAsync(config.privacyPolicyUrl)} style={{ textDecorationLine: 'underline' }}>
                  Privacy Policy
                </Txt>
                .
              </Txt>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: space.xl },
});
