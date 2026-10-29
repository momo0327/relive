import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import type { MediaItem } from '@/lib/types';
import { getViewerEntry, setViewerItems } from '@/lib/viewer-cache';
import { chooseReportReason } from '@/screens/report';
import { showActions, type SheetAction } from '@/ui/action-sheet';
import { Glass, IconButton, Txt } from '@/ui/primitives';
import { space } from '@/ui/theme';

export default function Viewer() {
  const { id: tripId, index: indexParam } = useLocalSearchParams<{ id: string; index?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { backend } = useSession();
  const [isOwner] = useState(() => getViewerEntry(tripId).isOwner);
  const [items, setItems] = useState<MediaItem[]>(() => getViewerEntry(tripId).items);
  const [index, setIndex] = useState(() => Math.min(Number(indexParam ?? 0), Math.max(items.length - 1, 0)));
  const [chrome, setChrome] = useState(true);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const list = useRef<FlatList<MediaItem>>(null);
  const current = items[index];

  // Signed URLs are short-lived; refresh the set if one stops working.
  const refreshUrls = useCallback(async () => {
    try {
      const fresh = await backend.listMedia(tripId);
      const byId = new Map(fresh.map((m) => [m.id, m]));
      setItems((prev) => {
        const next = prev.filter((m) => byId.has(m.id)).map((m) => byId.get(m.id)!);
        setViewerItems(tripId, next);
        return next;
      });
    } catch {
      // Keep what we have.
    }
  }, [backend, tripId]);

  // Keep the current page in place when rotating or resizing.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: index * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  useEffect(() => {
    if (items.length === 0) router.back();
  }, [items.length, router]);

  if (!current) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  async function download(item: MediaItem): Promise<File> {
    if (!item.url) throw new Error('unavailable');
    const ext = item.kind === 'photo' ? 'jpg' : /\.mp4(\?|$)/.test(item.url) ? 'mp4' : 'mov';
    const target = new File(Paths.cache, `relive-${item.id}.${ext}`);
    if (target.exists) target.delete();
    try {
      return await File.downloadFileAsync(item.url, target);
    } catch (error) {
      // Most likely an expired URL; fetch fresh ones and let the user retry.
      refreshUrls();
      throw error;
    }
  }

  async function save() {
    if (!current.url) return sampleOnly();
    setBusy('save');
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('Allow adding to Photos', 'Relive needs permission to add this memory to your photo library.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const file = await download(current);
      await MediaLibrary.Asset.create(file.uri);
      file.delete();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert('Saved to Photos');
    } catch (error) {
      Alert.alert('Couldn’t save', friendlyError(error));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!current.url) return sampleOnly();
    setBusy('share');
    try {
      const file = await download(current);
      await Sharing.shareAsync(file.uri, {
        mimeType: current.kind === 'photo' ? 'image/jpeg' : 'video/quicktime',
      });
      file.delete();
    } catch (error) {
      Alert.alert('Couldn’t share', friendlyError(error));
    } finally {
      setBusy(null);
    }
  }

  function sampleOnly() {
    Alert.alert('Sample memory', 'This is placeholder content in preview mode, so there’s nothing to save or share.');
  }

  function removeCurrent() {
    setItems((prev) => {
      const next = prev.filter((m) => m.id !== current.id);
      setViewerItems(tripId, next);
      return next;
    });
    setIndex((i) => Math.max(0, Math.min(i, items.length - 2)));
  }

  function more() {
    const actions: SheetAction[] = [];
    if (!current.isMine) {
      actions.push({
        text: 'Report…',
        onPress: () =>
          chooseReportReason(async (reason) => {
            try {
              await backend.report({ tripId, mediaId: current.id, reason });
              removeCurrent();
              Alert.alert('Thanks for telling us', 'This memory is now hidden for you. We review reports within 24 hours.');
            } catch (error) {
              Alert.alert('Couldn’t send report', friendlyError(error));
            }
          }),
      });
      actions.push({
        text: `Block ${current.uploaderName}`,
        destructive: true,
        onPress: () =>
          Alert.alert(
            `Block ${current.uploaderName}?`,
            'You won’t see their photos or videos in any trip. You can unblock them from Trip Options.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await backend.setBlocked(current.uploaderId, true);
                    router.back();
                  } catch (error) {
                    Alert.alert('Couldn’t block', friendlyError(error));
                  }
                },
              },
            ],
          ),
      });
    }
    if (!current.isMine && !isOwner) {
      showActions(undefined, actions);
      return;
    }
    actions.push({
      text: current.isMine ? 'Delete' : 'Remove from trip',
      destructive: true,
      onPress: () =>
        Alert.alert('Delete this memory?', 'It will be removed for everyone in the trip. This can’t be undone.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await backend.deleteMedia(current.id);
                removeCurrent();
              } catch (error) {
                Alert.alert('Couldn’t delete', friendlyError(error, 'Only the uploader or the trip organizer can delete this.'));
              }
            },
          },
        ]),
    });
    showActions(undefined, actions);
  }

  const date = current.takenAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(m) => m.id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <View style={{ width, height }}>
            {item.kind === 'video' ? (
              <VideoPage item={item} active={i === index} onError={refreshUrls} />
            ) : (
              <PhotoPage item={item} onTap={() => setChrome((v) => !v)} onError={refreshUrls} />
            )}
          </View>
        )}
      />

      {chrome ? (
        <>
          <View style={[styles.top, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.lg }]} pointerEvents="box-none">
            <IconButton icon="xmark" label="Close" glass overMedia onPress={() => router.back()} />
            <Glass overMedia style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, flexShrink: 1, alignItems: 'center' }}>
              <Txt variant="subhead" style={{ fontWeight: '600', color: '#fff', textAlign: 'center' }} numberOfLines={1}>
                {current.isMine ? 'You' : current.uploaderName}
              </Txt>
              <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }} numberOfLines={1}>
                {date}
              </Txt>
            </Glass>
            <View style={{ width: 44 }} />
          </View>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.lg) + (current.kind === 'video' ? 64 : 0) }]} pointerEvents="box-none">
            <Glass overMedia style={{ flexDirection: 'row', padding: space.xs, gap: space.xs }}>
              <IconButton icon="square.and.arrow.down" label="Save to Photos" tint="#fff" onPress={save} disabled={busy !== null} />
              <IconButton icon="square.and.arrow.up" label="Share" tint="#fff" onPress={share} disabled={busy !== null} />
              <IconButton icon="ellipsis" label="More actions" tint="#fff" onPress={more} />
            </Glass>
            <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }} accessibilityLiveRegion="polite">
              {busy === 'save' ? 'Saving…' : busy === 'share' ? 'Preparing…' : `${index + 1} of ${items.length}`}
            </Txt>
          </View>
        </>
      ) : null}
    </View>
  );
}

function PhotoPage({ item, onTap, onError }: { item: MediaItem; onTap: () => void; onError: () => void }) {
  if (item.sampleColors) {
    return (
      <Pressable style={{ flex: 1 }} onPress={onTap} accessibilityLabel="Sample photo">
        <LinearGradient colors={item.sampleColors} style={{ flex: 1 }} />
      </Pressable>
    );
  }
  return (
    <ScrollView
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flex: 1 }}>
      <Pressable style={{ flex: 1 }} onPress={onTap} accessibilityRole="image" accessibilityLabel={`Photo by ${item.uploaderName}`}>
        <Image
          source={{ uri: item.url ?? undefined, cacheKey: `media-${item.id}` }}
          style={{ flex: 1 }}
          contentFit="contain"
          onError={onError}
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    </ScrollView>
  );
}

function VideoPage({ item, active, onError }: { item: MediaItem; active: boolean; onError: () => void }) {
  // Only the visible page gets a player.
  if (item.sampleColors) {
    return <LinearGradient colors={item.sampleColors} style={{ flex: 1 }} />;
  }
  if (!active || !item.url) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return <ActiveVideo url={item.url} onError={onError} />;
}

function ActiveVideo({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => sub.remove();
  }, [player, onError]);
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls allowsPictureInPicture={false} />;
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: space.sm },
});

