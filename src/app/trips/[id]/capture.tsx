import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { limits } from '@/lib/config';
import { useLibraryPicker } from '@/lib/use-library-picker';
import { useTripUploads } from '@/lib/uploads';
import { CapturePreview, type Shot } from '@/screens/capture-preview';
import { useA11yPrefs } from '@/ui/a11y';
import { useLayout } from '@/ui/layout';
import { Button, Glass, IconButton, Row, Txt } from '@/ui/primitives';
import { radius, space } from '@/ui/theme';

type Mode = 'picture' | 'video';

export default function Capture() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { landscape } = useLayout();
  const { reduceMotion } = useA11yPrefs();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [mode, setMode] = useState<Mode>('picture');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [ready, setReady] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [flashShutter, setFlashShutter] = useState(false);
  const { items } = useTripUploads(tripId);
  // The shot being reviewed (Retake / Upload) before it joins the trip.
  const [shot, setShot] = useState<Shot | null>(null);
  const library = useLibraryPicker(tripId);

  // Ask for the camera only when this screen opens.
  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) requestCamera();
  }, [cameraPermission, requestCamera]);

  useEffect(() => {
    if (recordingSince == null) return;
    const id = setInterval(() => setElapsed((Date.now() - recordingSince) / 1000), 200);
    return () => clearInterval(id);
  }, [recordingSince]);

  async function switchMode(next: Mode) {
    if (recordingSince != null) return;
    // The microphone is only requested when switching to video.
    if (next === 'video' && micPermission && !micPermission.granted && micPermission.canAskAgain) {
      await requestMic();
    }
    setMode(next);
  }

  async function takePhoto() {
    if (!camera.current || !ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (!reduceMotion) {
      setFlashShutter(true);
      setTimeout(() => setFlashShutter(false), 120);
    }
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1, exif: false, shutterSound: true });
      setShot({ kind: 'photo', uri: photo.uri, width: photo.width, height: photo.height });
    } catch {
      Alert.alert('Couldn’t take photo', 'Please try again.');
    }
  }

  async function toggleRecording() {
    if (!camera.current || !ready) return;
    if (recordingSince != null) {
      camera.current.stopRecording();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    const started = Date.now();
    setRecordingSince(started);
    setElapsed(0);
    try {
      const result = await camera.current.recordAsync({ maxDuration: limits.maxVideoSeconds, maxFileSize: limits.maxUploadBytes });
      const durationMs = Math.min(Date.now() - started, limits.maxVideoSeconds * 1000);
      if (result?.uri) setShot({ kind: 'video', uri: result.uri, durationMs });
    } catch {
      Alert.alert('Couldn’t record video', 'Please try again.');
    } finally {
      setRecordingSince(null);
    }
  }

  if (!cameraPermission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!cameraPermission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + space.xl }]}>
        <View style={{ alignSelf: 'flex-start' }}>
          <IconButton icon="xmark" label="Close" tint="#fff" onPress={() => router.back()} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg, maxWidth: 480, alignSelf: 'center' }}>
          <Txt variant="title" style={{ color: '#fff', textAlign: 'center' }}>
            Camera access
          </Txt>
          <Txt variant="body" style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
            Relive uses the camera to capture memories for this trip. Photos and videos go straight into the sealed trip.
            Nothing is shown until the trip ends.
          </Txt>
          {cameraPermission.canAskAgain ? (
            <Button title="Allow camera" onPress={requestCamera} />
          ) : (
            <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          )}
        </View>
      </View>
    );
  }

  if (shot) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CapturePreview tripId={tripId} shot={shot} onRetake={() => setShot(null)} onDone={() => router.back()} />
      </View>
    );
  }

  const recording = recordingSince != null;
  const uploading = items.filter((i) => i.status === 'queued' || i.status === 'uploading').length;
  const savedThisSession = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const statusText = failed
    ? `${failed} didn’t upload. Check the trip page.`
    : uploading
      ? `Uploading ${uploading}…`
      : savedThisSession
        ? 'Memory saved. See it when your trip ends.'
        : mode === 'video'
          ? `Videos up to ${limits.maxVideoSeconds} seconds`
          : 'What you capture stays sealed until the trip ends';
  const remaining = Math.max(0, limits.maxVideoSeconds - elapsed);
  const micDenied = mode === 'video' && micPermission && !micPermission.granted;

  const controls = (
    <View style={[styles.controls, landscape ? { flexDirection: 'column-reverse' } : null]}>
      <IconButton
        icon="photo.on.rectangle"
        label="Add from library"
        tint="#fff"
        glass
        overMedia
        disabled={recording || library.picking}
        onPress={async () => {
          // Back to the trip page so the upload progress is visible.
          if ((await library.pick()) > 0) router.back();
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'picture' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
        onPress={mode === 'picture' ? takePhoto : toggleRecording}
        disabled={!ready}
        style={({ pressed }) => [styles.shutter, { opacity: ready ? (pressed ? 0.8 : 1) : 0.4 }]}>
        <View
          style={[
            styles.shutterInner,
            mode === 'video' && { backgroundColor: '#FF453A' },
            recording && { width: 30, height: 30, borderRadius: 8 },
          ]}
        />
      </Pressable>
      <IconButton
        icon="arrow.triangle.2.circlepath.camera"
        label="Switch camera"
        tint="#fff"
        glass
        overMedia
        disabled={recording}
        onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={mode}
        flash={flash}
        mute={!!micDenied}
        videoQuality="720p"
        onCameraReady={() => setReady(true)}
        onMountError={() => Alert.alert('Camera unavailable', 'The camera couldn’t start. Try closing and reopening.')}
        accessibilityLabel="Camera viewfinder"
      />
      {flashShutter ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.6 }]} /> : null}

      {/* Top bar */}
      <View
        style={[styles.top, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.lg }]}
        pointerEvents="box-none">
        <IconButton icon="xmark" label="Done" tint="#fff" glass overMedia disabled={recording} onPress={() => router.back()} />
        {recording ? (
          <Glass overMedia style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            <Txt variant="headline" style={{ color: '#FF453A', fontVariant: ['tabular-nums'] }} accessibilityLabel={`Recording, ${Math.ceil(remaining)} seconds left`}>
              ● 0:{String(Math.floor(elapsed)).padStart(2, '0')} / 0:{limits.maxVideoSeconds}
            </Txt>
          </Glass>
        ) : (
          <Glass overMedia style={{ flexDirection: 'row', padding: 3 }}>
            {(['picture', 'video'] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => switchMode(m)}
                style={[styles.modeItem, mode === m && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                <Txt variant="subhead" style={{ color: '#fff', fontWeight: mode === m ? '600' : '400' }}>
                  {m === 'picture' ? 'Photo' : 'Video'}
                </Txt>
              </Pressable>
            ))}
          </Glass>
        )}
        {mode === 'picture' ? (
          <IconButton
            icon={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'}
            label={flash === 'on' ? 'Flash on' : 'Flash off'}
            tint="#fff"
            glass
            overMedia
            onPress={() => setFlash((f) => (f === 'on' ? 'off' : 'on'))}
          />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Capture controls: bottom in portrait, trailing edge in landscape. */}
      <View
        style={[
          landscape
            ? { position: 'absolute', top: 0, bottom: 0, right: insets.right + space.lg, justifyContent: 'center' }
            : { position: 'absolute', left: 0, right: 0, bottom: insets.bottom + space.xl, alignItems: 'center' },
        ]}
        pointerEvents="box-none">
        {controls}
      </View>

      <View
        style={[
          styles.status,
          landscape ? { bottom: insets.bottom + space.lg, left: insets.left + space.lg } : { bottom: insets.bottom + 130, left: 0, right: 0, alignItems: 'center' },
        ]}
        pointerEvents="none">
        <Glass overMedia style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, maxWidth: 420 }}>
          <Row>
            <Txt variant="footnote" style={{ color: '#fff', textAlign: 'center' }} accessibilityLiveRegion="polite">
              {micDenied ? 'Microphone is off, so videos will be silent. ' : ''}
              {statusText}
            </Txt>
          </Row>
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permission: { flex: 1, backgroundColor: '#0B0B0F', padding: space.xl },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  modeItem: { paddingHorizontal: space.lg, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill },
  status: { position: 'absolute' },
});
