import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useAppearancePref } from '@/lib/appearance';
import { config } from '@/lib/config';
import { CancelledError, useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { useUploads } from '@/lib/uploads';
import { useLayout } from '@/ui/layout';
import { Avatar } from '@/ui/avatar';
import { Icon, Txt } from '@/ui/primitives';
import { SettingsRow } from '@/ui/settings-row';
import { radius, space, useTheme } from '@/ui/theme';

export default function Settings() {
  const c = useTheme();
  const { readableWidth } = useLayout();
  const { backend, mode, provider, email, userId, signOut, deleteAccount } = useSession();
  const { items, clearAll } = useUploads();
  const [pref, setPref] = useAppearancePref();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pending = items.filter((i) => i.status !== 'done').length;
  const preview = mode === 'preview';

  // Reload when returning from Edit Profile.
  useFocusEffect(
    useCallback(() => {
      backend
        .getProfile()
        .then(setProfile)
        .catch(() => undefined);
    }, [backend]),
  );

  function openLink(url: string, missing: string) {
    if (url) WebBrowser.openBrowserAsync(url);
    else Alert.alert('Not available yet', missing);
  }

  function openHelp() {
    if (config.helpUrl) return WebBrowser.openBrowserAsync(config.helpUrl);
    if (config.supportEmail) {
      return Linking.openURL(`mailto:${config.supportEmail}`).catch(() =>
        Alert.alert('Contact us', config.supportEmail),
      );
    }
    Alert.alert('Not available yet', 'The help page hasn’t been set up yet.');
  }

  function confirmSignOut() {
    if (preview) return signOut();
    const warning = pending
      ? `${pending} memories haven’t finished uploading. Signing out removes them from this device and they won’t be added to the trip.`
      : 'You can sign back in any time.';
    Alert.alert('Sign out?', warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: pending ? 'destructive' : 'default',
        onPress: () => {
          clearAll();
          signOut();
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and every photo and video you’ve added to any trip, and removes you from all trips. Trips you organize pass to the longest-standing member, or are deleted if you’re the only one. This can’t be undone.' +
        (provider === 'apple' ? '\n\nYou’ll confirm with Apple so we can also disconnect Sign in with Apple.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              clearAll();
            } catch (e) {
              if (!(e instanceof CancelledError)) {
                Alert.alert('Couldn’t delete account', 'Nothing was deleted. Check your connection and try again, or contact support.');
              }
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  const displayName = profile?.displayName || (preview ? 'You' : 'Traveler');
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', padding: space.lg, paddingBottom: space.xxxl }}>
      <View style={{ width: readableWidth, gap: space.lg }}>
        {/* Profile */}
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={`${displayName}${email ? `, ${email}` : ''}`}
          accessibilityHint="Edit your name, photo and avatar colour"
          style={({ pressed }) => [styles.card, styles.profile, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
          <Avatar id={userId ?? 'you'} name={displayName} url={profile?.avatarUrl} color={profile?.avatarColor} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title2" style={{ fontWeight: '700' }} numberOfLines={1}>
              {displayName}
            </Txt>
            <Txt variant="subhead" tone="secondary" numberOfLines={1}>
              {preview ? 'Preview mode' : email ?? 'Signed in'}
            </Txt>
          </View>
          <Icon name="pencil" size={18} color={c.textSecondary} />
        </Pressable>

        {/* Preferences and information */}
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <SettingsRow icon="circle.lefthalf.filled" label="Match system">
            <Switch
              value={pref === 'system'}
              onValueChange={(on) => setPref(on ? 'system' : c.scheme)}
              accessibilityLabel="Match system appearance"
            />
          </SettingsRow>
          <SettingsRow icon="moon" label="Dark mode">
            <Switch
              value={c.scheme === 'dark'}
              onValueChange={(on) => setPref(on ? 'dark' : 'light')}
              accessibilityLabel="Dark mode"
            />
          </SettingsRow>
          <SettingsRow
            icon="hand.raised"
            label="Privacy Policy"
            chevron
            onPress={() => openLink(config.privacyPolicyUrl, 'The privacy policy hasn’t been published yet.')}
          />
          <SettingsRow
            icon="doc.text"
            label="Terms of Use"
            chevron
            onPress={() => openLink(config.termsUrl, 'The terms of use haven’t been published yet.')}
          />
          <SettingsRow icon="questionmark.circle" label="Help & safety" chevron last onPress={openHelp} />
        </View>

        {/* Account actions */}
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <SettingsRow
            icon="rectangle.portrait.and.arrow.right"
            label={preview ? 'Exit preview' : 'Sign out'}
            destructive
            last={preview}
            onPress={confirmSignOut}
          />
          {!preview ? (
            <SettingsRow
              icon="trash"
              label={deleting ? 'Deleting…' : 'Delete account'}
              destructive
              chevron
              last
              onPress={deleting ? undefined : confirmDelete}
            />
          ) : null}
        </View>

        <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          L8R {version}
        </Txt>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg },
});
