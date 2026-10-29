import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { AVATAR_COLORS, Avatar } from '@/ui/avatar';
import { Button, Icon, Row, Txt } from '@/ui/primitives';
import { SheetLayout } from '@/ui/sheet-layout';
import { LoadingState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';

/** Edit Profile sheet: name, profile photo and avatar colour. */
export default function EditProfile() {
  const router = useRouter();
  const c = useTheme();
  const { backend, userId } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  // undefined = unchanged, null = remove, string = new local photo
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    backend
      .getProfile()
      .then((p) => {
        setName(p.displayName);
        setColor(p.avatarColor);
        setSavedPhoto(p.avatarUrl);
        setLoaded(true);
      })
      .catch((e) => {
        Alert.alert('Couldn’t load your profile', friendlyError(e));
        router.back();
      });
  }, [backend, router]);

  if (!loaded) return <LoadingState label="Loading profile" />;

  const shownPhoto = photo === undefined ? savedPhoto : photo;
  const trimmed = name.trim();

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function save() {
    if (!trimmed) return;
    setSaving(true);
    try {
      await backend.updateProfile({ displayName: trimmed, avatarColor: color });
      if (photo !== undefined) await backend.setAvatar(photo);
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save your profile', friendlyError(e));
      setSaving(false);
    }
  }

  return (
    <SheetLayout footer={<Button title="Save" onPress={save} loading={saving} disabled={!trimmed} />}>
      <View style={{ alignItems: 'center', gap: space.lg }}>
        <Pressable onPress={choosePhoto} accessibilityRole="button" accessibilityLabel="Choose profile photo">
          <Avatar id={userId ?? 'me'} name={trimmed || '?'} url={shownPhoto} color={color} size={120} />
          <View style={[styles.cameraBadge, { backgroundColor: c.text, borderColor: c.background }]}>
            <Icon name="camera.fill" size={15} color={c.background} />
          </View>
        </Pressable>
        <Row gap={space.md} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button title={shownPhoto ? 'Change photo' : 'Choose photo'} kind="secondary" onPress={choosePhoto} style={{ minHeight: 44 }} />
          {shownPhoto ? (
            <Button title="Remove photo" kind="destructive" onPress={() => setPhoto(null)} style={{ minHeight: 44 }} />
          ) : null}
        </Row>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="footnote" tone="secondary">
          AVATAR COLOUR
        </Txt>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {AVATAR_COLORS.map((swatch) => {
            const selected = (color ?? '').toUpperCase() === swatch.toUpperCase();
            return (
              <Pressable
                key={swatch}
                onPress={() => setColor(swatch)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Colour ${AVATAR_COLORS.indexOf(swatch) + 1}`}
                hitSlop={4}
                style={[styles.swatch, { backgroundColor: swatch, borderColor: selected ? c.text : 'transparent' }]}>
                {selected ? <Icon name="checkmark" size={16} color="#fff" weight="bold" /> : null}
              </Pressable>
            );
          })}
        </View>
        <Txt variant="footnote" tone="tertiary">
          Used behind your initials when you don’t have a photo.
        </Txt>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="footnote" tone="secondary" nativeID="profile-name-label">
          YOUR NAME
        </Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="Your first name"
          placeholderTextColor={c.textTertiary}
          returnKeyType="done"
          accessibilityLabelledBy="profile-name-label"
          style={[styles.input, { color: c.text, backgroundColor: c.surface }]}
        />
        <Txt variant="footnote" tone="tertiary">
          Shown to people in your trips. Your email is never shown to other members.
        </Txt>
      </View>
    </SheetLayout>
  );
}

const styles = StyleSheet.create({
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One row of eight that shares the width; wraps only on very narrow screens.
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  input: { fontSize: 17, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 50 },
});
