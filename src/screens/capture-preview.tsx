import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepError, preparePhoto, prepareVideo } from '@/lib/media-prep';
import { useTripUploads } from '@/lib/uploads';
import { Button, Glass, IconButton, Row, Txt } from '@/ui/primitives';
import { space } from '@/ui/theme';

export type Shot =
  | { kind: 'photo'; uri: string; width: number; height: number }
  | { kind: 'video'; uri: string; durationMs: number };

/**
 * Review a fresh capture before it goes into the sealed trip: Retake discards
 * it; Upload prepares it, queues it and shows the upload on top of the shot.
 * Once the server confirms, it shows "Memory saved" and calls onDone.
 */
export function CapturePreview({
  tripId,
  shot,
  onRetake,
  onDone,
}: {
  tripId: string;
  shot: Shot;
  onRetake: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { items, enqueue, retry } = useTripUploads(tripId);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);
  const item = mediaId ? items.find((i) => i.id === mediaId) : undefined;

  // Once the server confirms, close straight away; the trip page then shows
  // the usual "Memory saved" sheet for the finished upload.
  useEffect(() => {
    if (item?.status !== 'done' || finished.current) return;
    finished.current = true;
    onDone();
  }, [item?.status, onDone]);

  function retake() {
    try {
      const file = new File(shot.uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone.
    }
    onRetake();
  }

  async function upload() {
    setPreparing(true);
    setError(null);
    try {
      const media =
        shot.kind === 'photo'
          ? await preparePhoto({ tripId, uri: shot.uri, width: shot.width, height: shot.height })
          : await prepareVideo({ tripId, uri: shot.uri, durationMs: shot.durationMs, width: 0, height: 0, fromCamera: true });
      enqueue([media]);
      setMediaId(media.id);
    } catch (e) {
      setError(e instanceof PrepError ? e.message : 'This couldn’t be prepared. Try again or retake it.');
    } finally {
      setPreparing(false);
    }
  }

  const progress = item?.status === 'done' ? 1 : item?.progress ?? 0;
  const status = !item
    ? null
    : item.status === 'done'
      ? 'Memory saved. See it when your trip ends.'
      : item.status === 'failed'
        ? item.error ?? 'Upload interrupted.'
        : item.status === 'uploading'
          ? `Uploading ${Math.round(progress * 100)}%`
          : 'Waiting to upload…';

  return (
    <View style={StyleSheet.absoluteFill}>
      {shot.kind === 'photo' ? (
        <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Photo you just took" />
      ) : (
        <PreviewVideo uri={shot.uri} />
      )}

      {/* Upload progress drawn over the shot */}
      {item ? <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" /> : null}

      {!item ? (
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
          <IconButton icon="xmark" label="Retake" tint="#fff" glass overMedia onPress={retake} />
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.lg) + space.md }]} pointerEvents="box-none">
        {item ? (
          <Glass overMedia style={styles.statusPill}>
            <View style={{ gap: space.sm, alignItems: 'center' }} accessible accessibilityLiveRegion="polite" accessibilityLabel={status ?? ''}>
              <Txt variant="headline" style={{ color: '#fff', textAlign: 'center' }}>
                {status}
              </Txt>
              {item.status !== 'done' && item.status !== 'failed' ? (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
              ) : null}
              {item.status === 'failed' && !item.permanent ? (
                <Button title="Retry now" kind="secondary" onPress={() => retry(item.id)} style={{ minHeight: 40 }} />
              ) : null}
              {item.status === 'failed' ? (
                <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }} onPress={onDone}>
                  It stays in the trip’s upload list. Tap to close.
                </Txt>
              ) : null}
            </View>
          </Glass>
        ) : (
          <>
            {error ? (
              <Txt variant="footnote" style={{ color: '#FF8A80', textAlign: 'center', marginBottom: space.sm }}>
                {error}
              </Txt>
            ) : null}
            <Row gap={space.md} style={{ justifyContent: 'center' }}>
              <Button title="Retake" kind="secondary" onPress={retake} style={{ minWidth: 130 }} />
              <Button title="Upload" icon="arrow.up" kind="accent" loading={preparing} onPress={upload} style={{ minWidth: 150 }} />
            </Row>
            <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: space.sm }}>
              Once uploaded it’s sealed. Nobody, including you, sees it until the trip ends.
            </Txt>
          </>
        )}
      </View>
    </View>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: space.lg },
  bottom: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, alignItems: 'stretch' },
  dim: { backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  statusPill: { borderRadius: 24, paddingHorizontal: space.xl, paddingVertical: space.lg },
  track: { width: 220, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
});
