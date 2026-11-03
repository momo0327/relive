import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COVER_COLORS, coverColorUri } from '@/lib/cover-colors';
import { friendlyError } from '@/lib/errors';
import { formatRevealMoment, plural } from '@/lib/format';
import { measureTone } from '@/lib/image-tone';
import { ensureNotificationPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { downloadUnsplash, onUnsplashPick, searchUnsplash, type UnsplashPhoto } from '@/lib/unsplash';
import { haptic, withTap } from '@/ui/haptics';
import { useLayout } from '@/ui/layout';
import { Button, Icon, Txt } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 62;
const NAME_MAX = 40;
const STEPS = ['Name your trip', 'Trip dates', 'Cover', 'Preview'] as const;

type Cover =
  | { kind: 'library'; uri: string; tone: 'light' | 'dark' }
  | { kind: 'unsplash'; photo: UnsplashPhoto }
  | { kind: 'color'; index: number };

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Full-screen, three-step trip creation: name → dates → cover. */
export default function NewTrip() {
  const router = useRouter();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, readableWidth } = useLayout();
  const { backend, mode } = useSession();
  const pager = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState(0);

  const today = startOfDay(new Date());
  const [name, setName] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 3));
  const [cover, setCover] = useState<Cover | null>(null);
  const [saving, setSaving] = useState(false);

  const unlocksAt = addDays(end, 1); // midnight after the last day, device time zone
  const days = Math.round((unlocksAt.getTime() - start.getTime()) / DAY);
  const dateProblem =
    end < start ? 'The trip can’t end before it starts.' : days > MAX_DAYS ? `Trips can last up to ${MAX_DAYS} days.` : null;

  function goTo(next: number) {
    setStep(next);
    // The preview (last step) is a full-screen overlay above the cover page.
    pager.current?.scrollTo({ x: Math.min(next, 2) * width, animated: true });
  }

  function back() {
    haptic.tap();
    if (step === 0) router.back();
    else goTo(step - 1);
  }

  async function create() {
    setSaving(true);
    try {
      let coverUri: string | null = null;
      if (cover?.kind === 'library') coverUri = cover.uri;
      if (cover?.kind === 'unsplash') coverUri = await downloadUnsplash(cover.photo);
      if (cover?.kind === 'color') coverUri = await coverColorUri(COVER_COLORS[cover.index].module);
      const id = await backend.createTrip({ name: name.trim(), startsAt: start, unlocksAt, coverUri });
      ensureNotificationPermission().catch(() => undefined);
      router.dismissTo(`/trips/${id}`);
      router.push(`/trips/${id}/invite`);
    } catch (error) {
      Alert.alert('Couldn’t create trip', friendlyError(error));
      setSaving(false);
    }
  }

  const previewUri =
    cover?.kind === 'library'
      ? cover.uri
      : cover?.kind === 'unsplash'
        ? cover.photo.regular
        : cover?.kind === 'color'
          ? (RNImage.resolveAssetSource(COVER_COLORS[cover.index].module)?.uri ?? null)
          : null;

  const page = { width, paddingHorizontal: (width - readableWidth) / 2 };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header: close / back, step title, page indicator */}
      <View style={{ paddingTop: insets.top + space.sm, alignItems: 'center' }}>
        <View style={[styles.header, { width: readableWidth }]}>
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={step === 0 ? 'Close' : 'Back'}
            hitSlop={8}
            style={({ pressed }) => [styles.circle, { backgroundColor: c.text, opacity: pressed ? 0.75 : 1 }]}>
            <Icon name={step === 0 ? 'xmark' : 'arrow.left'} size={18} color={c.background} weight="semibold" />
          </Pressable>
          <Txt variant="headline" style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
            {STEPS[step]}
          </Txt>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === step ? c.text : c.border, width: i === step ? 22 : 8 }]} />
          ))}
        </View>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}>
        {/* 1 · Name */}
        <View style={[page, styles.namePage]}>
          <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
            <Txt variant="title" style={{ textAlign: 'center', fontWeight: '700' }}>
              Give your trip a name
            </Txt>
            <View style={[styles.field, { backgroundColor: c.surface }]}>
              <TextInput
                value={name}
                onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
                placeholder="Summer in Lisbon"
                placeholderTextColor={c.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => name.trim() && goTo(1)}
                accessibilityLabel="Trip name"
                style={[styles.input, { color: c.text }]}
              />
              <Txt variant="subhead" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
                {name.length}/{NAME_MAX}
              </Txt>
            </View>
          </View>
          <Button title="Continue" disabled={!name.trim()} onPress={() => goTo(1)} style={{ marginBottom: insets.bottom + space.md }} />
        </View>

        {/* 2 · Dates */}
        <View style={page}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingTop: space.lg }}>
            <DateCard
              label="Starts"
              value={start}
              minimumDate={addDays(today, -30)}
              onChange={(d) => {
                setStart(d);
                if (end < d) setEnd(d);
              }}
            />
            <DateCard label="Ends" value={end} minimumDate={start < today ? today : start} onChange={setEnd} />
            <View style={[styles.card, styles.revealRow, { backgroundColor: c.surface }]}>
              <Icon name="lock.fill" size={16} color={c.locked} />
              <Txt variant="subhead" tone="secondary" style={{ flex: 1 }}>
                {plural(days, 'day')}. Memories stay sealed until{' '}
                <Txt variant="subhead" style={{ fontWeight: '600' }}>
                  {formatRevealMoment(unlocksAt)}
                </Txt>
                , then unlock for everyone at once. Dates can’t be changed later.
              </Txt>
            </View>
            {dateProblem ? (
              <Txt variant="footnote" tone="danger" accessibilityLiveRegion="polite">
                {dateProblem}
              </Txt>
            ) : null}
          </ScrollView>
          <Button
            title="Continue"
            disabled={!!dateProblem}
            onPress={() => goTo(2)}
            style={{ marginBottom: insets.bottom + space.md, marginTop: space.md }}
          />
        </View>

        {/* 3 · Cover */}
        <View style={page}>
          <CoverStep
            cover={cover}
            onCover={(next) => {
              setCover(next);
              goTo(3);
            }}
            unsplashEnabled={mode === 'live'}
          />
          <Button
            title="Continue"
            onPress={() => {
              if (!cover) setCover({ kind: 'color', index: 0 });
              goTo(3);
            }}
            style={{ marginBottom: insets.bottom + space.md, marginTop: space.md }}
          />
        </View>
      </ScrollView>

      {step === 3 && cover ? (
        <CoverPreview
          cover={cover}
          previewUri={previewUri}
          saving={saving}
          onBack={() => goTo(2)}
          onContinue={create}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Full-screen look at the chosen cover before creating the trip. */
function CoverPreview({
  cover,
  previewUri,
  saving,
  onBack,
  onContinue,
}: {
  cover: Cover;
  previewUri: string | null;
  saving: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      {cover.kind === 'color' ? (
        <LinearGradient colors={COVER_COLORS[cover.index].colors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : previewUri ? (
        <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel="Cover preview" />
      ) : null}

      {/* Rule-of-thirds guides, like a camera framing grid. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[1, 2].map((i) => (
          <View key={`v${i}`} style={[styles.gridV, { left: `${(i * 100) / 3}%` }]} />
        ))}
        {[1, 2].map((i) => (
          <View key={`h${i}`} style={[styles.gridH, { top: `${(i * 100) / 3}%` }]} />
        ))}
      </View>

      <View style={[styles.previewTop, { top: insets.top + space.sm }]}>
        <Pressable
          onPress={withTap(onBack)}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => [styles.circle, { backgroundColor: '#000', opacity: pressed ? 0.75 : 1 }]}>
          <Icon name="arrow.left" size={18} color="#fff" weight="semibold" />
        </Pressable>
        {cover.kind === 'unsplash' ? (
          <Pressable
            onPress={() => Linking.openURL(cover.photo.authorUrl)}
            accessibilityRole="link"
            accessibilityLabel={`Photo by ${cover.photo.author} on Unsplash`}
            style={styles.credit}>
            <View style={styles.creditIcon}>
              <Icon name="camera.fill" size={14} color="#000" />
            </View>
            <Txt variant="subhead" style={{ color: '#fff', fontWeight: '600' }} numberOfLines={1}>
              {cover.photo.author}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.previewBottom, { paddingBottom: insets.bottom + space.md }]}>
        <Button title="Continue" loading={saving} onPress={onContinue} style={{ backgroundColor: '#000' }} />
      </View>
    </Animated.View>
  );
}

function DateCard({ label, value, minimumDate, onChange }: { label: string; value: Date; minimumDate: Date; onChange: (d: Date) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <Txt variant="footnote" tone="secondary">
        {label.toUpperCase()}
      </Txt>
      <Txt variant="headline">{value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Txt>
      <DateTimePicker
        value={value}
        mode="date"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        minimumDate={minimumDate}
        onValueChange={(_e, d) => {
          haptic.select();
          onChange(startOfDay(d));
        }}
        accessibilityLabel={`${label} date`}
        style={{ height: 150 }}
      />
    </View>
  );
}

function CoverStep({
  cover,
  onCover,
  unsplashEnabled,
}: {
  cover: Cover | null;
  onCover: (cover: Cover) => void;
  unsplashEnabled: boolean;
}) {
  const router = useRouter();
  const c = useTheme();
  const [featured, setFeatured] = useState<UnsplashPhoto[] | null>(null);
  const [unsplashOff, setUnsplashOff] = useState(!unsplashEnabled);

  useEffect(() => {
    if (!unsplashEnabled) return;
    searchUnsplash()
      .then((p) => setFeatured(p.slice(0, 12)))
      .catch(() => setUnsplashOff(true)); // not configured or offline: hide the section
  }, [unsplashEnabled]);

  // Photos picked on the search screen come back here.
  useEffect(() => {
    onUnsplashPick((photo) => onCover({ kind: 'unsplash', photo }));
    return () => onUnsplashPick(null);
  }, [onCover]);

  async function pickLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.9 });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    onCover({ kind: 'library', uri, tone: await measureTone(uri) });
  }

  const ring = (on: boolean) => ({ borderColor: on ? c.text : 'transparent', borderWidth: 3 });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingTop: space.lg }}>
      {/* Library */}
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={[styles.circle, { backgroundColor: c.text }]}>
          <Icon name="camera.fill" size={18} color={c.background} />
        </View>
        <Txt variant="title2" style={{ fontWeight: '700' }}>
          Select from your library
        </Txt>
        <Button title="Select Photo" onPress={pickLibrary} style={{ alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: space.lg }} />
      </View>

      {/* Unsplash */}
      {!unsplashOff ? (
        <View style={[styles.card, { backgroundColor: c.surface, paddingRight: 0 }]}>
          <View style={[styles.cardHeader, { paddingRight: space.lg }]}>
            <Txt variant="title2" style={{ fontWeight: '700' }}>
              Unsplash
            </Txt>
            <Button title="Search" onPress={() => router.push('/trips/unsplash')} style={{ minHeight: 36, paddingHorizontal: space.lg }} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}>
            {(featured ?? []).map((p) => {
              const on = cover?.kind === 'unsplash' && cover.photo.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={withTap(() => onCover({ kind: 'unsplash', photo: p }))}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Photo by ${p.author}`}
                  accessibilityState={{ selected: on }}>
                  <Image
                    source={{ uri: p.thumb }}
                    style={[styles.tile, { backgroundColor: p.color ?? c.background }, ring(on)]}
                    contentFit="cover"
                    transition={150}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
          {cover?.kind === 'unsplash' ? (
            <Txt variant="caption" tone="tertiary">
              Photo by {cover.photo.author} on Unsplash
            </Txt>
          ) : null}
        </View>
      ) : null}

      {/* Colours */}
      <View style={[styles.card, { backgroundColor: c.surface, paddingRight: 0 }]}>
        <Txt variant="title2" style={{ fontWeight: '700' }}>
          Colours
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}>
          {COVER_COLORS.map((col, i) => {
            const on = cover?.kind === 'color' && cover.index === i;
            return (
              <Pressable
                key={col.id}
                onPress={() => {
                  haptic.select();
                  onCover({ kind: 'color', index: i });
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Colour ${i + 1}`}
                accessibilityState={{ checked: on }}>
                <LinearGradient colors={col.colors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.tile, ring(on)]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: space.md, marginBottom: space.sm },
  dot: { height: 8, borderRadius: 4 },
  namePage: { justifyContent: 'space-between' },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.xl, paddingHorizontal: space.xl, minHeight: 64 },
  input: { flex: 1, fontSize: 20, paddingVertical: space.md },
  card: { borderRadius: radius.xl, padding: space.lg, gap: space.md },
  revealRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tile: { width: 110, height: 150, borderRadius: 16 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.45)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.45)' },
  previewTop: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewBottom: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  credit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 999, paddingLeft: 4, paddingRight: space.lg, height: 44, maxWidth: 220 },
  creditIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
