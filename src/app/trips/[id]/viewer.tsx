import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import type { MediaItem } from '@/lib/types';
import { getViewerEntry, setViewerItems } from '@/lib/viewer-cache';
import { playTick } from '@/lib/tick-sound';
import { useVideoThumbnail } from '@/lib/video-thumbs';
import { haptic, withTap } from '@/ui/haptics';
import { chooseReportReason } from '@/screens/report';
import { showActions, type SheetAction } from '@/ui/action-sheet';
import { Avatar } from '@/ui/avatar';
import { Glass, Icon, IconButton, Txt } from '@/ui/primitives';
import { space } from '@/ui/theme';

export default function Viewer() {
  const { id: tripId, index: indexParam } = useLocalSearchParams<{ id: string; index?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { backend } = useSession();
  const [{ isOwner, tripName, members }] = useState(() => getViewerEntry(tripId));
  const [videoPlayer, setVideoPlayer] = useState<VideoPlayer | null>(null);
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

  // Optimistic: flip the heart right away, roll back if the server refuses.
  async function toggleLike() {
    const target = current;
    if (!target) return;
    const liked = !target.liked;
    haptic.impact();
    const apply = (value: boolean) =>
      setItems((prev) => {
        const next = prev.map((m) => (m.id === target.id ? { ...m, liked: value } : m));
        setViewerItems(tripId, next);
        return next;
      });
    apply(liked);
    try {
      await backend.setLiked(target.id, liked);
    } catch (e) {
      apply(!liked);
      Alert.alert('Couldn’t update Favourites', friendlyError(e));
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
    const actions: SheetAction[] = [{ text: 'Save to Photos', onPress: save }];
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
  const uploader = members.find((m) => m.userId === current.uploaderId);

  function jumpTo(i: number) {
    setIndex(i);
    list.current?.scrollToIndex({ index: i, animated: false });
  }

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
              <VideoPage item={item} active={i === index} onError={refreshUrls} onPlayer={setVideoPlayer} onTap={() => setChrome((v) => !v)} />
            ) : (
              <PhotoPage item={item} onTap={() => setChrome((v) => !v)} onError={refreshUrls} />
            )}
          </View>
        )}
      />

      {chrome ? (
        <>
          {/* Shading so the controls read on any photo. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
            style={[styles.shade, { top: 0, height: insets.top + 110 }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
            style={[styles.shade, { bottom: 0, height: insets.bottom + 220 }]}
            pointerEvents="none"
          />

          <View
            style={[styles.top, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.lg }]}
            pointerEvents="box-none">
            <IconButton icon="arrow.left" label="Back" glass overMedia onPress={() => router.back()} />
            <View style={{ alignItems: 'center', flexShrink: 1 }} accessible accessibilityLiveRegion="polite">
              <Txt variant="headline" style={{ color: '#fff' }}>
                {busy === 'save' ? 'Saving…' : busy === 'share' ? 'Preparing…' : `${index + 1} of ${items.length}`}
              </Txt>
              {tripName ? (
                <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>
                  {tripName}
                </Txt>
              ) : null}
            </View>
            <IconButton icon="ellipsis" label="More actions" glass overMedia onPress={more} />
          </View>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.sm) }]} pointerEvents="box-none">
            {current.kind === 'video' && videoPlayer ? (
              <View style={{ paddingHorizontal: insets.left + space.lg }}>
                <VideoProgress player={videoPlayer} />
              </View>
            ) : null}
            <View style={[styles.infoRow, { paddingHorizontal: insets.left + space.lg }]}>
              <Avatar
                id={current.uploaderId}
                name={current.isMine ? 'You' : current.uploaderName}
                url={uploader?.avatarUrl}
                color={uploader?.avatarColor}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <Txt variant="headline" style={{ color: '#fff' }} numberOfLines={1}>
                  {current.isMine ? 'You' : current.uploaderName}
                </Txt>
                <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.75)' }} numberOfLines={1}>
                  {date}
                </Txt>
              </View>
              <IconButton icon="square.and.arrow.up" label="Share" tint="#fff" onPress={share} disabled={busy !== null} />
              <IconButton
                icon={current.liked ? 'heart.fill' : 'heart'}
                label={current.liked ? 'Remove from Favourites' : 'Add to Favourites'}
                tint="#fff"
                onPress={toggleLike}
              />
            </View>
            <Filmstrip items={items} index={index} onSelect={jumpTo} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const THUMB_W = 46;
const THUMB_GAP = 6;
const THUMB_STEP = THUMB_W + THUMB_GAP;

/**
 * Scrubber under the photo: a fixed white frame in the centre with the
 * thumbnails sliding beneath it. Whatever passes under the frame becomes the
 * photo shown (live while dragging), with a haptic tick and a soft click.
 */
function Filmstrip({ items, index, onSelect }: { items: MediaItem[]; index: number; onSelect: (i: number) => void }) {
  const { width } = useWindowDimensions();
  const strip = useRef<FlatList<MediaItem>>(null);
  const dragging = useRef(false);
  const shown = useRef(index);
  const side = (width - THUMB_W) / 2;

  // Follow swipes on the big photo, but never fight the user's own drag.
  // The first run only positions (no animation) in case contentOffset was ignored.
  const firstRun = useRef(true);
  useEffect(() => {
    if (dragging.current) return;
    shown.current = index;
    strip.current?.scrollToOffset({ offset: index * THUMB_STEP, animated: !firstRun.current });
    firstRun.current = false;
  }, [index]);

  function centred(x: number) {
    return Math.max(0, Math.min(items.length - 1, Math.round(x / THUMB_STEP)));
  }

  function settle(x: number) {
    const i = centred(x);
    if (Math.abs(x - i * THUMB_STEP) > 0.5) strip.current?.scrollToOffset({ offset: i * THUMB_STEP, animated: true });
  }

  return (
    <View style={{ height: 76, justifyContent: 'center' }}>
      <FlatList
        ref={strip}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.id}
        // Room on both sides so the first and last can sit in the frame.
        contentContainerStyle={{ paddingHorizontal: side, alignItems: 'center' }}
        ItemSeparatorComponent={() => <View style={{ width: THUMB_GAP }} />}
        getItemLayout={(_d, i) => ({ length: THUMB_STEP, offset: THUMB_STEP * i, index: i })}
        // Start already centred on the current photo (e.g. when the controls reappear).
        contentOffset={{ x: index * THUMB_STEP, y: 0 }}
        // Free momentum (glides and slows down naturally); it settles on the
        // nearest thumbnail once it comes to rest.
        decelerationRate="normal"
        scrollEventThrottle={16}
        initialNumToRender={20}
        windowSize={9}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onMomentumScrollEnd={(e) => {
          dragging.current = false;
          settle(e.nativeEvent.contentOffset.x);
        }}
        onScrollEndDrag={(e) => {
          if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) {
            dragging.current = false;
            settle(e.nativeEvent.contentOffset.x);
          }
        }}
        onScroll={(e) => {
          // Only the user's own drag (and its glide) changes the photo. Scrolls
          // made by the app (initial position when the strip reappears after
          // hiding the controls, following a swipe) must not, or it would jump.
          if (!dragging.current) return;
          const i = centred(e.nativeEvent.contentOffset.x);
          if (i === shown.current) return;
          shown.current = i;
          haptic.select();
          playTick();
          onSelect(i);
        }}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => {
              if (i !== shown.current) {
                shown.current = i;
                haptic.select();
                onSelect(i);
              }
              strip.current?.scrollToOffset({ offset: i * THUMB_STEP, animated: true });
            }}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${item.kind === 'video' ? 'Video' : 'Photo'} ${i + 1} of ${items.length}`}
            accessibilityState={{ selected: i === index }}
            style={styles.thumb}>
            {item.sampleColors ? (
              <LinearGradient colors={item.sampleColors} style={StyleSheet.absoluteFill} />
            ) : item.thumbUrl || (item.kind === 'photo' && item.url) ? (
              <Image
                source={{ uri: item.thumbUrl ?? item.url!, cacheKey: item.thumbUrl ? `thumb-${item.id}` : `media-${item.id}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={0}
                cachePolicy="disk"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="play.fill" size={16} color="#fff" />
              </View>
            )}
          </Pressable>
        )}
      />
      {/* Fixed frame in the centre; the strip slides beneath it. */}
      <View pointerEvents="none" style={[styles.frame, { left: (width - THUMB_W) / 2 - 4 }]} />
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
          // The grid's small preview is already on disk: show it until the full photo arrives.
          placeholder={item.thumbUrl ? { uri: item.thumbUrl, cacheKey: `thumb-${item.id}` } : undefined}
          placeholderContentFit="contain"
          style={{ flex: 1 }}
          contentFit="contain"
          // Same disk-cache key as the gallery tile, so it shows instantly.
          cachePolicy="disk"
          transition={0}
          priority="high"
          onError={onError}
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    </ScrollView>
  );
}

function VideoPage({
  item,
  active,
  onError,
  onPlayer,
  onTap,
}: {
  item: MediaItem;
  active: boolean;
  onError: () => void;
  onPlayer: (player: VideoPlayer | null) => void;
  /** Tap anywhere: hide or show all controls, like photos. */
  onTap: () => void;
}) {
  // The first frame shows immediately (and on pages next to the current one);
  // only the visible page gets a player, which fades in once it has a frame.
  const localFrame = useVideoThumbnail(item, !item.thumbUrl);
  const poster = item.thumbUrl ?? localFrame;
  if (item.sampleColors) {
    return <LinearGradient colors={item.sampleColors} style={{ flex: 1 }} />;
  }
  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={onTap} accessibilityLabel="Video" accessibilityHint="Tap to show or hide controls">
      {poster ? (
        <Image
          source={{ uri: poster, cacheKey: item.thumbUrl ? `thumb-${item.id}` : undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={0}
        />
      ) : null}
      {active && item.url ? <ActiveVideo url={item.url} onError={onError} onPlayer={onPlayer} /> : null}
    </Pressable>
  );
}

function ActiveVideo({ url, onError, onPlayer }: { url: string; onError: () => void; onPlayer: (p: VideoPlayer | null) => void }) {
  const [shown, setShown] = useState(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.05;
    // Start as soon as a little is buffered instead of waiting for more.
    p.bufferOptions = { preferredForwardBufferDuration: 2, waitsToMinimizeStalling: false };
    p.play();
  });
  useEffect(() => {
    onPlayer(player);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => {
      sub.remove();
      onPlayer(null);
    };
  }, [player, onError, onPlayer]);
  return (
    <VideoView
      player={player}
      // Taps go to the page (show/hide controls), not the video view.
      pointerEvents="none"
      // Transparent until the first frame is drawn, so the poster stays visible instead of black.
      style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}
      onFirstFrameRender={() => setShown(true)}
      contentFit="contain"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

/** Native player mutation, kept outside components for the React Compiler. */
function seekPlayer(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}
function setPlayerMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

/** iOS 26-style media bar: glass pill with play/pause, a draggable progress track and mute. */
function VideoProgress({ player }: { player: VideoPlayer }) {
  const [time, setTime] = useState(player.currentTime);
  const [duration, setDuration] = useState(player.duration);
  const [playing, setPlaying] = useState(player.playing);
  const [muted, setMuted] = useState(player.muted);
  const [width, setWidth] = useState(1);
  const scrubbing = useRef(false);
  const wasPlaying = useRef(true);
  useEffect(() => {
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!scrubbing.current) setTime(currentTime);
      if (player.duration) setDuration(player.duration);
    });
    const play = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    const mute = player.addListener('mutedChange', ({ muted: m }) => setMuted(m));
    return () => {
      time.remove();
      play.remove();
      mute.remove();
    };
  }, [player]);

  function seek(x: number) {
    if (!duration) return;
    const t = Math.max(0, Math.min(duration, (x / width) * duration));
    setTime(t);
    seekPlayer(player, t);
  }

  const pct = duration ? Math.min(1, time / duration) : 0;
  return (
    <Glass overMedia style={styles.mediaBar}>
      <Pressable
        onPress={withTap(() => (playing ? player.pause() : player.play()))}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        hitSlop={10}
        style={styles.mediaButton}>
        <Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color="#fff" />
      </Pressable>
      <View
        style={styles.progress}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          scrubbing.current = true;
          wasPlaying.current = player.playing;
          player.pause();
          seek(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => seek(e.nativeEvent.locationX)}
        onResponderRelease={() => {
          scrubbing.current = false;
          if (wasPlaying.current) player.play();
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Video position"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(time) }}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(pct * 100, 3)}%` }]} />
        </View>
      </View>
      <Pressable
        onPress={withTap(() => setPlayerMuted(player, !muted))}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        hitSlop={10}
        style={styles.mediaButton}>
        <Icon name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} size={18} color="#fff" />
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: space.md },
  shade: { position: 'absolute', left: 0, right: 0 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: THUMB_W, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  mediaBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: 26, height: 52, paddingHorizontal: space.md },
  mediaButton: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, height: 40, justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },
  frame: { position: 'absolute', width: THUMB_W + 8, height: 72, borderRadius: 11, borderWidth: 2.5, borderColor: '#fff' },
});

