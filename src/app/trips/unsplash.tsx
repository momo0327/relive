import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/lib/errors';
import { pickUnsplash, searchUnsplash, type UnsplashPhoto } from '@/lib/unsplash';
import { haptic } from '@/ui/haptics';
import { useLayout } from '@/ui/layout';
import { IconButton, Txt } from '@/ui/primitives';
import { SkeletonGrid } from '@/ui/skeleton';
import { MessageState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';

const COLUMNS = 3;
const GAP = 8;

/** Search Unsplash for a trip cover; picking a photo hands it back to New Trip. */
export default function UnsplashSearch() {
  const router = useRouter();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const { q } = useLocalSearchParams<{ q?: string }>();
  // Starts with the trip's name, so matching photos are there right away.
  const [query, setQuery] = useState(q ?? '');
  const [photos, setPhotos] = useState<UnsplashPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced search; empty query shows popular photos.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      searchUnsplash(query)
        .then((result) => active && (setPhotos(result), setError(null)))
        .catch((e) => active && setError(friendlyError(e, 'Couldn’t load photos.')));
    }, query ? 350 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const tile = (width - gutter * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + space.sm }}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <IconButton icon="xmark" label="Close" glass onPress={() => router.back()} />
        <Txt variant="headline" style={{ flex: 1, textAlign: 'center' }}>
          Unsplash
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ paddingHorizontal: gutter, paddingVertical: space.md }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search images"
          placeholderTextColor={c.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search Unsplash"
          style={[styles.search, { color: c.text, backgroundColor: c.surface }]}
        />
      </View>
      {!photos ? (
        error ? (
          <MessageState icon="wifi.exclamationmark" title="Couldn’t load photos" message={error} />
        ) : (
          <View style={{ paddingHorizontal: gutter }}>
            <SkeletonGrid columns={COLUMNS} width={width - gutter * 2} gap={GAP} rows={4} ratios={[1.6]} />
          </View>
        )
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={COLUMNS}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.xl, gap: GAP }}
          columnWrapperStyle={{ gap: GAP }}
          ListEmptyComponent={<MessageState icon="photo" title="No photos found" message="Try another search." />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo by ${item.author}`}
              onPress={() => {
                haptic.tap();
                pickUnsplash(item);
                router.back();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
              <Image
                source={{ uri: item.thumb }}
                placeholder={item.color ? { blurhash: undefined } : undefined}
                style={[styles.tile, { width: tile, height: tile * 1.6, backgroundColor: item.color ?? c.surface }]}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          )}
          ListFooterComponent={
            <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center', marginTop: space.md }} onPress={() => Linking.openURL('https://unsplash.com/?utm_source=relive&utm_medium=referral')}>
              Photos from Unsplash
            </Txt>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  search: { fontSize: 17, borderRadius: radius.lg, paddingHorizontal: space.lg, minHeight: 52 },
  tile: { borderRadius: 14 },
});
