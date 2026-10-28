import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { parseInviteToken } from '@/lib/invite-link';
import { Button, Txt } from '@/ui/primitives';
import { SheetLayout } from '@/ui/sheet-layout';
import { radius, space, useTheme } from '@/ui/theme';

/** Join a trip by pasting an invite link (for links shared outside iMessage). */
export default function JoinWithLink() {
  const router = useRouter();
  const c = useTheme();
  const [text, setText] = useState('');
  const token = parseInviteToken(text);
  const showError = text.trim().length > 0 && !token;

  async function paste() {
    const value = await Clipboard.getStringAsync();
    if (value) setText(value.trim());
  }

  function join() {
    if (!token) return;
    router.dismiss();
    router.push(`/join/${token}`);
  }

  return (
    <SheetLayout footer={<Button title="Continue" onPress={join} disabled={!token} />}>
      <View style={{ gap: space.xs }}>
        <Txt variant="title2" style={{ fontWeight: '700' }}>
          Join with a link
        </Txt>
        <Txt variant="callout" tone="secondary">
          Paste the invite link a friend sent you. You’ll see the trip before you join.
        </Txt>
      </View>

      <View style={{ gap: space.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Invite link"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={join}
          accessibilityLabel="Invite link"
          style={[styles.input, { color: c.text, backgroundColor: c.surface }]}
        />
        {showError ? (
          <Txt variant="footnote" tone="danger" accessibilityLiveRegion="polite">
            This doesn’t look like an L8R invite link.
          </Txt>
        ) : null}
        <Button title="Paste from clipboard" icon="doc.on.clipboard" kind="secondary" onPress={paste} />
      </View>
    </SheetLayout>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 17, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
});
