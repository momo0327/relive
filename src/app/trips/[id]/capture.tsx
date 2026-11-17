import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType, type LensInfo } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FALLBACK_ZOOM, lensName, zoomLabel, zoomProp, zoomSetup, type ZoomSetup } from '@/lib/camera-zoom';
import { limits } from '@/lib/config';
import { takeRecorder } from '@/lib/take-recorder';
import { canMergeClips, mergeClips } from '@/lib/video-merge';
import { useLibraryPicker } from '@/lib/use-library-picker';
import { CapturePreview, type Shot } from '@/screens/capture-preview';
import { useA11yPrefs } from '@/ui/a11y';
import { CameraShell } from '@/ui/camera-shell';
import { useLayout } from '@/ui/layout';
import { Button, Glass, Icon, IconButton, Txt } from '@/ui/primitives';
import { radius, space } from '@/ui/theme';
import { haptic, withTap } from '@/ui/haptics';

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
  // The shot being reviewed (Retake / Upload) before it joins the trip.
  const [shot, setShot] = useState<Shot | null>(null);
  const library = useLibraryPicker(tripId);
  // Recording state machine (see take-recorder.ts).
  const recorder = takeRecorder;
  const [joining, setJoining] = useState(false);
  // TEMPORARY camera diagnostics (remove once zoom is confirmed on device).
  const [debugLenses, setDebugLenses] = useState<LensInfo[] | null>(null);

  // Zoom, in the phone's zoom factors (see camera-zoom.ts). Starts on the main (1x) lens.
  const [setup, setSetup] = useState<ZoomSetup>(FALLBACK_ZOOM);
  const [zoom, setZoom] = useState(1);
  const [showLens, setShowLens] = useState(false);
  const hideLens = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ramp = useRef<(() => void) | null>(null);

  function revealLens() {
    setShowLens(true);
    if (hideLens.current) clearTimeout(hideLens.current);
    hideLens.current = setTimeout(() => setShowLens(false), 1200);
  }

  function applyZoom(next: number) {
    const clamped = Math.max(setup.min, Math.min(setup.max, next));
    setZoom((prev) => {
      // A tick when the phone changes lens, like the Camera app.
      if (lensName(prev, setup) !== lensName(clamped, setup)) haptic.select();
      return clamped;
    });
    revealLens();
  }

  /** Glide to a quick-zoom stop instead of jumping. */
  function zoomTo(target: number) {
    ramp.current?.();
    haptic.select();
    ramp.current = glide(zoom, target, applyZoom);
  }

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

  // One recording can span several clips (flipping mid-recording); they're
  // joined into one video at the end. See take-recorder.ts / video-merge.ts.

  function toggleRecording() {
    if (!camera.current || !ready || joining) return;
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    recorder.start();
  }

  function resetForFlip() {
    setSetup(FALLBACK_ZOOM);
    setZoom(1);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }

  function flip() {
    if (recorder.recording && !canMergeClips) return;
    haptic.tap();
    // Mid-recording the recorder ends the clip first, then switches camera.
    if (!recorder.flip()) resetForFlip();
  }

  async function finishTake(clips: string[], durationMs: number) {
    setRecordingSince(null);
    if (clips.length === 0) {
      Alert.alert('Couldn’t record video', 'Please try again.');
      return;
    }
    if (clips.length === 1) {
      setShot({ kind: 'video', uri: clips[0], durationMs });
      return;
    }
    setJoining(true);
    try {
      const uri = await mergeClips(clips);
      deleteFiles(clips);
      setShot({ kind: 'video', uri, durationMs });
    } catch {
      // Keep what we can: the first clip.
      deleteFiles(clips.slice(1));
      setShot({ kind: 'video', uri: clips[0], durationMs });
    } finally {
      setJoining(false);
    }
  }

  const [torchSettled, setTorchSettled] = useState(true);
  const torchWanted = mode === 'video' && flash === 'on' && facing === 'back';
  useEffect(() => {
    if (!torchWanted) return;
    const off = setTimeout(() => setTorchSettled(false), 0);
    const on = setTimeout(() => setTorchSettled(true), 450);
    return () => {
      clearTimeout(off);
      clearTimeout(on);
    };
  }, [torchWanted, mode, facing, recordingSince]);

  // Leaving the screen ends any recording.
  useEffect(() => () => recorder.stop(), [recorder]);
  useLayoutEffect(() => {
    recorder.hooks = {
      camera: () => camera.current,
      switchCamera: resetForFlip,
      onStart: (at) => {
        setRecordingSince(at);
        setElapsed(0);
      },
      onFinish: finishTake,
    };
  });

  // Pinch to zoom and double-tap to flip, on the viewfinder.
  const gesture = useRef({ pinch: null as null | { dist: number; zoom: number }, moved: false, multi: false, lastTap: 0 });
  const latest = useRef({ zoom, applyZoom, flip });
  useLayoutEffect(() => {
    latest.current = { zoom, applyZoom, flip };
  });
  const [touchHandlers] = useState(() => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => true,
    onResponderGrant: (e: GestureResponderEvent) => {
      const g = gesture.current;
      g.moved = false;
      g.multi = e.nativeEvent.touches.length > 1;
      g.pinch = null;
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const g = gesture.current;
      const touches = e.nativeEvent.touches;
      if (touches.length < 2) {
        g.moved = true;
        return;
      }
      g.multi = true;
      const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
      if (!g.pinch) g.pinch = { dist, zoom: latest.current.zoom };
      else if (dist > 0 && g.pinch.dist > 0) latest.current.applyZoom(g.pinch.zoom * (dist / g.pinch.dist));
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const g = gesture.current;
      const wasTap = !g.multi && !g.moved;
      g.pinch = null;
      if (!wasTap) return;
      if (e.nativeEvent.timestamp - g.lastTap < 300) {
        g.lastTap = 0;
        latest.current.flip();
      } else {
        g.lastTap = e.nativeEvent.timestamp;
      }
    },
  }));

  function applyLenses(lenses: LensInfo[]) {
    setDebugLenses(lenses);
    const next = zoomSetup(lenses, facing);
    setSetup(next);
    setZoom(next.wide);
    recorder.cameraSwitched();
  }
  /** Ask the camera for its lenses too (the change event alone was not always delivered). */
  function refreshLenses() {
    camera.current
      ?.getAvailableLensesAsync()
      .then((lenses) => lenses.length && applyLenses(lenses))
      .catch(() => undefined);
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
            Relive uses the camera to capture memories for this trip. Photos and videos go straight into the sealed trip. Nothing
            is shown until the trip ends.
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
        <CapturePreview
          tripId={tripId}
          shot={shot}
          onRetake={() => setShot(null)}
          // Back to the trip page, which shows the "Memory saved" sheet.
          onDone={() => router.back()}
        />
      </View>
    );
  }

  const recording = recordingSince != null;
  const micDenied = mode === 'video' && micPermission && !micPermission.granted;
  const lensLabel = lensName(zoom, setup);
  // Back camera light for video. The front camera has none: a white ring light around the screen instead.
  const torch = mode === 'video' && flash === 'on' && facing === 'back';
  const ringLight = mode === 'video' && flash === 'on' && facing === 'front';

  const shutter = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mode === 'picture' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
      onPress={mode === 'picture' ? takePhoto : toggleRecording}
      disabled={!ready || joining}
      style={({ pressed }) => [styles.shutter, { opacity: ready ? 1 : 0.4, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      {joining ? <ActivityIndicator color="#000" style={StyleSheet.absoluteFill} /> : null}
      <View
        style={[
          styles.shutterInner,
          mode === 'video' && { backgroundColor: '#FF3B30' },
          recording && { width: 32, height: 32, borderRadius: 8 },
        ]}
      />
    </Pressable>
  );

  const galleryButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add from library"
      disabled={recording || library.picking}
      onPress={async () => {
        haptic.tap();
        // Back to the trip page so the upload progress is visible.
        if ((await library.pick()) > 0) router.back();
      }}
      style={({ pressed }) => [styles.sideButton, { borderRadius: 14, opacity: recording ? 0.35 : pressed ? 0.7 : 1 }]}>
      <Icon name="photo.on.rectangle" size={22} color="#fff" />
    </Pressable>
  );

  const flipButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch camera"
      accessibilityHint="You can also double-tap the viewfinder"
      disabled={recording && !canMergeClips}
      onPress={flip}
      style={({ pressed }) => [
        styles.sideButton,
        { borderRadius: 26, opacity: recording && !canMergeClips ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <Icon name="arrow.triangle.2.circlepath" size={22} color="#fff" />
    </Pressable>
  );

  const modes = (
    <View style={[styles.modes, landscape && { flexDirection: 'column' }]} accessibilityRole="tablist">
      {(['picture', 'video'] as const).map((m) => (
        <Pressable
          key={m}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === m, disabled: recording }}
          disabled={recording}
          onPress={() => {
            if (m === mode) return;
            haptic.select();
            switchMode(m);
          }}
          style={[styles.modeItem, mode === m && { backgroundColor: '#fff' }]}>
          <Txt variant="subhead" style={{ color: mode === m ? '#000' : 'rgba(255,255,255,0.6)', fontWeight: '600' }}>
            {m === 'picture' ? 'Photo' : 'Video'}
          </Txt>
        </Pressable>
      ))}
    </View>
  );

  return (
    // Pinch to zoom and double-tap to flip on the viewfinder.
    <CameraShell
      viewportProps={touchHandlers}
      viewport={
        <>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            // Save front-camera shots the way the viewfinder showed them (like a mirror).
            mirror={facing === 'front'}
            mode={mode}
            flash={mode === 'picture' ? flash : 'off'}
            // Re-sent after each reconfiguration (mode, flip, recording start), which turns the light off.
          enableTorch={torch && torchSettled}
            mute={!!micDenied}
            videoQuality="720p"
            selectedLens={setup.lens}
            zoom={zoomProp(zoom, setup)}
            onAvailableLensesChanged={({ lenses }) => applyLenses(lenses)}
            onCameraReady={() => {
              setReady(true);
              refreshLenses();
            }}
            onMountError={() => Alert.alert('Camera unavailable', 'The camera couldn’t start. Try closing and reopening.')}
            accessibilityLabel="Camera viewfinder"
          />
          {flashShutter ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.6 }]} /> : null}
          {ringLight ? <View pointerEvents="none" style={styles.ringLight} /> : null}
          <View pointerEvents="none" style={styles.debug}>
            <Txt variant="caption" style={{ color: '#0f0', fontSize: 10 }}>
              {`dbg2 ${facing} exact=${setup.exact} lens=${(setup.lens ?? '-').replace('AVCaptureDeviceTypeBuiltIn', '')} wide=${setup.wide} min=${setup.min} max=${Math.round(setup.max)} stops=${setup.stops.join(',')} zoom=${zoom.toFixed(2)} prop=${zoomProp(zoom, setup).toFixed(2)} torch=${torch}\n${
                debugLenses == null
                  ? 'no lenses yet'
                  : debugLenses
                      .map((l) => `${l.deviceType.replace('AVCaptureDeviceTypeBuiltIn', '')}[${(l.switchOverZoomFactors ?? []).join('/')}|${l.minZoomFactor ?? '?'}-${l.maxZoomFactor != null ? Math.round(l.maxZoomFactor) : '?'}]`)
                      .join(' ')
              }`}
            </Txt>
          </View>

          {/* Close (left) and flash (right). */}
          <View
            style={[
              styles.top,
              { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.lg, paddingRight: space.lg },
            ]}
            pointerEvents="box-none">
            <IconButton
              icon="xmark"
              label="Close"
              tint="#fff"
              glass
              overMedia
              disabled={recording}
              onPress={() => router.back()}
            />
            {recording ? (
              <Glass overMedia style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                <Txt
                  variant="headline"
                  style={{ color: '#FF453A', fontVariant: ['tabular-nums'] }}
                  accessibilityLabel={`Recording, ${Math.ceil(Math.max(0, limits.maxVideoSeconds - elapsed))} seconds left`}>
                  ● 0:{String(Math.floor(elapsed)).padStart(2, '0')} / 0:{limits.maxVideoSeconds}
                </Txt>
              </Glass>
            ) : null}
            <IconButton
              icon={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'}
              label={mode === 'video' ? (flash === 'on' ? 'Light on' : 'Light off') : flash === 'on' ? 'Flash on' : 'Flash off'}
              tint={flash === 'on' ? '#FFD60A' : '#fff'}
              glass
              overMedia
              onPress={withTap(() => setFlash((f) => (f === 'on' ? 'off' : 'on')))}
            />
          </View>

          {/* Zoom: which lens while zooming, and quick stops (.5, 1x, 2 …). */}
          <View style={styles.zoomArea} pointerEvents="box-none">
            {showLens ? (
              <View style={styles.lensTag} pointerEvents="none">
                <Txt variant="caption" style={{ color: '#fff', fontWeight: '600' }}>
                  {lensLabel} · {zoomLabel(zoom, setup)}×
                </Txt>
              </View>
            ) : null}
            {setup.stops.length > 1 ? (
              <View style={styles.zoomRow}>
                {setup.stops.map((stop, i) => {
                  const nextStop = setup.stops[i + 1] ?? Infinity;
                  const active = zoom >= stop - 0.01 && zoom < nextStop - 0.01;
                  return (
                    <Pressable
                      key={stop}
                      accessibilityRole="button"
                      accessibilityLabel={`Zoom ${zoomLabel(stop, setup)}x`}
                      accessibilityState={{ selected: active }}
                      hitSlop={6}
                      onPress={() => zoomTo(stop)}
                      style={[styles.zoomStop, active && styles.zoomStopActive]}>
                      <Txt
                        variant="caption"
                        style={{
                          color: active ? '#FFD60A' : '#fff',
                          fontWeight: '700',
                          fontSize: active ? 13 : 12,
                          fontVariant: ['tabular-nums'],
                        }}>
                        {active ? `${zoomLabel(zoom, setup)}×` : zoomLabel(stop, setup)}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </>
      }
      controls={
        <>
          {galleryButton}
          {shutter}
          {flipButton}
        </>
      }
      below={modes}
    />
  );
}

function deleteFiles(uris: string[]) {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone.
    }
  }
}

/** Eases the zoom from one factor to another (in log space, so 0.5x -> 1x feels like 1x -> 2x). Returns a cancel function. */
function glide(from: number, to: number, apply: (z: number) => void) {
  let frame = 0;
  let start = 0;
  const step = (now: number) => {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / 220);
    apply(from * Math.pow(to / from, 1 - Math.pow(1 - t, 3)));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

const styles = StyleSheet.create({
  ringLight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 34, borderColor: '#FFFFFF', borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  debug: { position: 'absolute', left: 8, right: 8, top: 110, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4 },
  permission: { flex: 1, backgroundColor: '#0B0B0F', padding: space.xl },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff' },
  sideButton: { width: 52, height: 52, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  modes: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space.xs },
  modeItem: { paddingHorizontal: space.lg, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill },
  zoomArea: { position: 'absolute', left: 0, right: 0, bottom: space.lg, alignItems: 'center', gap: space.sm },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  zoomStop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  zoomStopActive: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.55)' },
  lensTag: { paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.5)' },
});
