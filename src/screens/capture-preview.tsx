import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrepError, preparePhoto, prepareVideo } from '@/lib/media-prep';
import { useTripUploads } from '@/lib/uploads';
import { CameraShell } from '@/ui/camera-shell';
import { Button, Row, Txt } from '@/ui/primitives';
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

  const progress = item?.status === 'done' ? 1 : (item?.progress ?? 0);
  const failed = item?.status === 'failed';
  const status = !item
    ? null
    : item.status === 'done'
      ? 'Saved'
      : failed
        ? (item.error ?? 'Upload interrupted.')
        : item.status === 'uploading'
          ? `Uploading ${Math.round(progress * 100)}%`
          : 'Waiting to upload…';

  return (
    <CameraShell
      viewport={
        <>
          {shot.kind === 'photo' ? (
            <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo you just took" />
          ) : (
            <PreviewVideo uri={shot.uri} />
          )}
          {item ? <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" /> : null}
        </>
      }
      controls={
        item ? (
          // Upload progress in place of the buttons.
          <View style={styles.progress} accessible accessibilityLiveRegion="polite" accessibilityLabel={status ?? ''}>
            <Txt variant="headline" style={{ color: '#fff', textAlign: 'center' }} numberOfLines={2}>
              {status}
            </Txt>
            {!failed && item.status !== 'done' ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            ) : null}
            {failed ? (
              <Row gap={space.md}>
                {!item.permanent ? <Button title="Retry" kind="secondary" onPress={() => retry(item.id)} style={{ minHeight: 40 }} /> : null}
                <Button title="Close" kind="plain" onPress={onDone} style={{ minHeight: 40 }} />
              </Row>
            ) : null}
          </View>
        ) : (
          // Retake beside a wide Upload pill.
          <Row gap={space.md} style={styles.actions}>
            <Button title="Retake" kind="dark" disabled={preparing} onPress={retake} style={styles.retake} />
            <Button title="Upload" icon="arrow.up" kind="light" loading={preparing} onPress={upload} style={styles.uploadPill} />
          </Row>
        )
      }
      below={
        error ? (
          <Txt variant="footnote" style={{ color: '#FF8A80', textAlign: 'center' }} numberOfLines={2}>
            {error}
          </Txt>
        ) : null
      }
    />
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  actions: { flex: 1, paddingHorizontal: space.xl, alignItems: 'center' },
  retake: { minWidth: 120, minHeight: 56 },
  uploadPill: { flex: 1, minHeight: 56 },
  progress: { flex: 1, alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl },
  track: { width: 220, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
});
