import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { Button, Txt } from '@/ui/primitives';
import { SheetLayout } from '@/ui/sheet-layout';
import { radius, space, useTheme } from '@/ui/theme';

/**
 * Email + password sign-in for accounts created in the Supabase dashboard
 * (App Review demo account). Public sign-up is disabled on the server, so this
 * can't create new accounts.
 */
export default function EmailSignIn() {
  const c = useTheme();
  const { signInWithEmail } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = /\S+@\S+\.\S+/.test(email) && password.length > 0;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      // On success the session guard swaps this screen for the app.
    } catch (e) {
      Alert.alert('Couldn’t sign in', friendlyError(e, 'Check the email and password and try again.'));
      setBusy(false);
    }
  }

  const input = [styles.input, { color: c.text, backgroundColor: c.surface }];
  return (
    <SheetLayout footer={<Button title="Sign in" onPress={submit} loading={busy} disabled={!ready} />}>
      <Txt variant="callout" tone="secondary">
        For accounts set up by the Relive team. Everyone else can continue with Apple or Google.
      </Txt>
      <View style={{ gap: space.md }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          accessibilityLabel="Email"
          style={input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={c.textTertiary}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabel="Password"
          style={input}
        />
      </View>
    </SheetLayout>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 17, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 50 },
});
