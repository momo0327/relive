import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { measureTone } from '@/lib/image-tone';

import { useLayout } from './layout';
import { Button, Row, Txt } from './primitives';
import { radius, space, useTheme } from './theme';
import { TripPoster } from './trip-poster';

export type PosterCover = { uri: string; tone: 'light' | 'dark'; isNew: boolean } | null;

/**
 * Live preview of the trip's home-page poster, with the controls that shape
 * it: cover photo and trip name. Shared by New Trip and Edit Trip.
 */
export function PosterEditor({
  name,
  onNameChange,
  cover,
  onCoverChange,
  seed,
}: {
  name: string;
  onNameChange: (name: string) => void;
  cover: PosterCover;
  onCoverChange: (cover: PosterCover) => void;
  seed: string;
}) {
  const c = useTheme();
  const { readableWidth } = useLayout();
  const [measuring, setMeasuring] = useState(false);
  const posterWidth = Math.min(readableWidth * 0.62, 260);

  async function pickCover() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setMeasuring(true);
    const tone = await measureTone(uri);
    setMeasuring(false);
    onCoverChange({ uri, tone, isNew: true });
  }

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <View accessible accessibilityLabel={`Poster preview: ${name.trim() || 'your trip'}`} style={styles.shadow}>
          <TripPoster
            name={name.trim() || 'Your trip'}
            coverUrl={cover?.uri ?? null}
            coverKey={cover?.uri ?? null}
            tone={cover?.tone ?? 'dark'}
            seed={seed}
            style={{ width: posterWidth, borderRadius: radius.lg }}
          />
        </View>
        <Row gap={space.sm} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            title={cover ? 'Change photo' : 'Add cover photo'}
            icon="photo"
            kind="secondary"
            loading={measuring}
            onPress={pickCover}
            style={{ minHeight: 44 }}
          />
          {cover?.isNew ? (
            <Button title="Remove" kind="destructive" onPress={() => onCoverChange(null)} style={{ minHeight: 44 }} />
          ) : null}
        </Row>
        <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          This is how the trip appears on everyone’s home screen. The cover isn’t one of the hidden memories.
        </Txt>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="footnote" tone="secondary" nativeID="trip-name-label">
          TRIP NAME
        </Txt>
        <TextInput
          value={name}
          onChangeText={onNameChange}
          placeholder="Summer in Lisbon"
          placeholderTextColor={c.textTertiary}
          maxLength={80}
          returnKeyType="done"
          accessibilityLabelledBy="trip-name-label"
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceRaised }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  input: { fontSize: 20, fontWeight: '600', borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
});
