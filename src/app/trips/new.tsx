import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image as RNImage,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COVER_COLORS, coverColorUri } from "@/lib/cover-colors";
import { friendlyError } from "@/lib/errors";
import { formatRevealMoment, plural } from "@/lib/format";
import { measureTone } from "@/lib/image-tone";
import { ensureNotificationPermission } from "@/lib/notifications";
import { editTripList, refreshTripList, setLocalCover } from "@/lib/trip-list";
import { setTripPreview } from "@/lib/trip-preview";
import type { TripSummary } from "@/lib/types";
import { useSession } from "@/lib/session";
import {
  downloadUnsplash,
  onUnsplashPick,
  searchUnsplash,
  type UnsplashPhoto,
} from "@/lib/unsplash";
import { haptic, withTap } from "@/ui/haptics";
import { Skeleton } from "@/ui/skeleton";
import { useLayout } from "@/ui/layout";
import { Button, Icon, Txt } from "@/ui/primitives";
import { radius, space, useTheme } from "@/ui/theme";

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 62;
const NAME_MAX = 40;
const STEPS = ["Name your trip", "Trip dates", "Cover", "Preview"] as const;

type Cover =
  | { kind: "library"; uri: string; tone: "light" | "dark" }
  | { kind: "unsplash"; photo: UnsplashPhoto }
  | { kind: "color"; index: number };

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
  // Later pages mount when first reached, so the screen opens instantly
  // (the date wheels and the Unsplash fetch are the heavy parts).
  const [reached, setReached] = useState(0);

  const today = startOfDay(new Date());
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 3));
  const [cover, setCover] = useState<Cover | null>(null);
  const [saving, setSaving] = useState(false);

  const unlocksAt = addDays(end, 1); // midnight after the last day, device time zone
  const days = Math.round((unlocksAt.getTime() - start.getTime()) / DAY);
  const dateProblem =
    end < start
      ? "The trip can’t end before it starts."
      : days > MAX_DAYS
        ? `Trips can last up to ${MAX_DAYS} days.`
        : null;

  const nameInput = useRef<TextInputInstance>(null);
  function goTo(next: number) {
    // The keyboard belongs to the name page only.
    if (next === 0) nameInput.current?.focus();
    else Keyboard.dismiss();
    setStep(next);
    setReached((r) => Math.max(r, next));
    // The preview (last step) is a full-screen overlay above the cover page.
    pager.current?.scrollTo({ x: Math.min(next, 2) * width, animated: true });
  }

  function back() {
    haptic.tap();
    goTo(step - 1);
  }

  async function create() {
    setSaving(true);
    try {
      // Create the trip itself first (one quick request) and open it at once;
      // the cover is prepared and uploaded in the background.
      const id = await backend.createTrip({ name: name.trim(), startsAt: start, unlocksAt, coverUri: null });
      const now = new Date();
      const trip: TripSummary = {
        id,
        name: name.trim(),
        coverUrl: previewUri,
        coverKey: null,
        coverTone: cover?.kind === "library" ? cover.tone : "dark",
        startsAt: start,
        unlocksAt,
        status: start > now ? "upcoming" : "active",
        isOwner: true,
        memberCount: 1,
        memoryCount: 0,
        myMemoryCount: 0,
        createdAt: now,
      };
      setLocalCover(id, previewUri);
      setTripPreview(trip);
      editTripList((trips) => [trip, ...trips.filter((t) => t.id !== id)]);
      if (cover) uploadCoverLater(id, cover);
      ensureNotificationPermission().catch(() => undefined);
      router.dismissTo(`/trips/${id}`);
      router.push(`/trips/${id}/invite`);
    } catch (error) {
      Alert.alert("Couldn’t create trip", friendlyError(error));
      setSaving(false);
    }
  }

  function uploadCoverLater(id: string, chosen: Cover) {
    (async () => {
      let coverUri: string | null = null;
      if (chosen.kind === "library") coverUri = chosen.uri;
      if (chosen.kind === "unsplash") coverUri = await downloadUnsplash(chosen.photo);
      if (chosen.kind === "color") coverUri = await coverColorUri(COVER_COLORS[chosen.index].module);
      if (!coverUri) return;
      await backend.updateTrip(id, { coverUri });
      // The server has the cover now: refresh the list to pick it up.
      refreshTripList();
    })().catch(() => undefined); // the trip exists either way; it keeps its local cover for now
  }

  const previewUri =
    cover?.kind === "library"
      ? cover.uri
      : cover?.kind === "unsplash"
        ? cover.photo.regular
        : cover?.kind === "color"
          ? (RNImage.resolveAssetSource(COVER_COLORS[cover.index].module)
              ?.uri ?? null)
          : null;

  const page = { width, paddingHorizontal: (width - readableWidth) / 2 };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      {/* Header: close / back, step title, page indicator */}
      <View style={{ paddingTop: insets.top + space.sm, alignItems: "center" }}>
        <View style={[styles.header, { width: readableWidth }]}>
          {step > 0 ? (
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={({ pressed }) => [styles.circle, { backgroundColor: c.text, opacity: pressed ? 0.75 : 1 }]}>
              <Icon name="arrow.left" size={18} color={c.background} weight="semibold" />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
          <Txt variant="headline" style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
            {STEPS[step]}
          </Txt>
          {/* Close sits where the home page's + was, so it reads as "undo that tap". */}
          <Pressable
            onPress={withTap(() => router.back())}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={({ pressed }) => [styles.circle, { backgroundColor: '#FFFFFF', opacity: pressed ? 0.75 : 1 }]}>
            <Icon name="xmark" size={18} color="#0E0F10" weight="semibold" />
          </Pressable>
        </View>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? c.text : c.border,
                  width: i === step ? 22 : 8,
                },
              ]}
            />
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
        style={{ flex: 1 }}
      >
        {/* 1 · Name */}
        <View style={[page, styles.namePage]}>
          <View style={{ flex: 1, justifyContent: "center", gap: space.xl }}>
            <Txt
              variant="title"
              style={{ textAlign: "center", fontWeight: "700" }}
            >
              Give your trip a name
            </Txt>
            <View style={[styles.field, { backgroundColor: c.surface }]}>
              <TextInput
                ref={nameInput}
                // Keyboard up as soon as the page opens.
                autoFocus
                value={name}
                onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
                placeholder="Summer in Lisbon"
                placeholderTextColor={c.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => name.trim() && goTo(1)}
                accessibilityLabel="Trip name"
                style={[styles.input, { color: c.text }]}
              />
              <Txt
                variant="subhead"
                tone="tertiary"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {name.length}/{NAME_MAX}
              </Txt>
            </View>
          </View>
          <Button
            title="Continue"
            disabled={!name.trim()}
            onPress={() => goTo(1)}
            style={{ marginBottom: insets.bottom + space.md }}
          />
        </View>

        {/* 2 · Dates */}
        <View style={page}>
          {reached >= 1 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: space.md, paddingTop: space.lg }}
            >
              <DateCard
                label="Starts"
                value={start}
                minimumDate={addDays(today, -30)}
                onChange={(d) => {
                  setStart(d);
                  if (end < d) setEnd(d);
                }}
              />
              <DateCard
                label="Ends"
                value={end}
                minimumDate={start < today ? today : start}
                onChange={setEnd}
              />
              <View
                style={[
                  styles.card,
                  styles.revealRow,
                  { backgroundColor: c.surface },
                ]}
              >
                <Icon name="lock.fill" size={18} color={c.text} />
                <Txt variant="callout" style={{ flex: 1, lineHeight: 22 }}>
                  {plural(days, "day")}. Memories stay sealed until{" "}
                  <Txt variant="callout" style={{ fontWeight: "700" }}>
                    {formatRevealMoment(unlocksAt)}
                  </Txt>
                  , then unlock for everyone at once. Dates can’t be changed
                  later.
                </Txt>
              </View>
              {dateProblem ? (
                <Txt
                  variant="footnote"
                  tone="danger"
                  accessibilityLiveRegion="polite"
                >
                  {dateProblem}
                </Txt>
              ) : null}
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            title="Continue"
            disabled={!!dateProblem}
            onPress={() => goTo(2)}
            style={{
              marginBottom: insets.bottom + space.md,
              marginTop: space.md,
            }}
          />
        </View>

        {/* 3 · Cover */}
        <View style={page}>
          {reached >= 2 ? (
            <CoverStep
              query={name}
              cover={cover}
              onCover={(next) => {
                setCover(next);
                goTo(3);
              }}
              unsplashEnabled={mode === "live"}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            title="Continue"
            onPress={() => {
              if (!cover) setCover({ kind: "color", index: 0 });
              goTo(3);
            }}
            style={{
              marginBottom: insets.bottom + space.md,
              marginTop: space.md,
            }}
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
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}
    >
      {cover.kind === "color" ? (
        <LinearGradient
          colors={COVER_COLORS[cover.index].colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : previewUri ? (
        <Image
          source={{ uri: previewUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel="Cover preview"
        />
      ) : null}

      {/* Rule-of-thirds guides, like a camera framing grid. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[1, 2].map((i) => (
          <View
            key={`v${i}`}
            style={[styles.gridV, { left: `${(i * 100) / 3}%` }]}
          />
        ))}
        {[1, 2].map((i) => (
          <View
            key={`h${i}`}
            style={[styles.gridH, { top: `${(i * 100) / 3}%` }]}
          />
        ))}
      </View>

      <View style={[styles.previewTop, { top: insets.top + space.sm }]}>
        <Pressable
          onPress={withTap(onBack)}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => [
            styles.circle,
            { backgroundColor: "#000", opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Icon name="arrow.left" size={18} color="#fff" weight="semibold" />
        </Pressable>
        {cover.kind === "unsplash" ? (
          <Pressable
            onPress={() => Linking.openURL(cover.photo.authorUrl)}
            accessibilityRole="link"
            accessibilityLabel={`Photo by ${cover.photo.author} on Unsplash`}
            style={styles.credit}
          >
            <View style={styles.creditIcon}>
              <Icon name="camera.fill" size={14} color="#000" />
            </View>
            <Txt
              variant="subhead"
              style={{ color: "#fff", fontWeight: "600" }}
              numberOfLines={1}
            >
              {cover.photo.author}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.previewBottom,
          { paddingBottom: insets.bottom + space.md },
        ]}
      >
        <Button title="Continue" kind="dark" loading={saving} onPress={onContinue} style={{ backgroundColor: "#000" }} />
      </View>
    </Animated.View>
  );
}

function DateCard({
  label,
  value,
  minimumDate,
  onChange,
}: {
  label: string;
  value: Date;
  minimumDate: Date;
  onChange: (d: Date) => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <Txt variant="footnote" tone="secondary">
        {label.toUpperCase()}
      </Txt>
      <Txt variant="headline">
        {value.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </Txt>
      <DateTimePicker
        value={value}
        mode="date"
        display={Platform.OS === "ios" ? "spinner" : "default"}
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
  query,
}: {
  cover: Cover | null;
  onCover: (cover: Cover) => void;
  unsplashEnabled: boolean;
  /** The trip name: photos that match it come first. */
  query: string;
}) {
  const router = useRouter();
  const c = useTheme();
  const [featured, setFeatured] = useState<UnsplashPhoto[] | null>(null);
  const [unsplashOff, setUnsplashOff] = useState(!unsplashEnabled);

  // Photos for the trip's name (e.g. "Lisbon"), or popular ones if nothing matches.
  const [searchFor] = useState(query.trim());
  useEffect(() => {
    if (!unsplashEnabled) return;
    (async () => {
      let photos = searchFor ? await searchUnsplash(searchFor) : [];
      if (photos.length < 4) photos = await searchUnsplash();
      setFeatured(photos.slice(0, 12));
    })().catch(() => setUnsplashOff(true)); // not configured or offline: hide the section
  }, [unsplashEnabled, searchFor]);

  // Photos picked on the search screen come back here.
  useEffect(() => {
    onUnsplashPick((photo) => onCover({ kind: "unsplash", photo }));
    return () => onUnsplashPick(null);
  }, [onCover]);

  async function pickLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    onCover({ kind: "library", uri, tone: await measureTone(uri) });
  }

  const ring = (on: boolean) => ({
    borderColor: on ? c.text : "transparent",
    borderWidth: 3,
  });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: space.md, paddingTop: space.lg }}
    >
      {/* Library */}
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={[styles.circle, { backgroundColor: c.text }]}>
          <Icon name="camera.fill" size={18} color={c.background} />
        </View>
        <Txt variant="title2" style={{ fontWeight: "700" }}>
          Select from your library
        </Txt>
        <Button
          title="Select Photo"
          onPress={pickLibrary}
          style={{
            alignSelf: "flex-start",
            minHeight: 40,
            paddingHorizontal: space.lg,
          }}
        />
      </View>

      {/* Unsplash */}
      {!unsplashOff ? (
        <View
          style={[styles.card, { backgroundColor: c.surface, paddingRight: 0 }]}
        >
          <View style={[styles.cardHeader, { paddingRight: space.lg }]}>
            <Txt variant="title2" style={{ fontWeight: "700" }}>
              Unsplash
            </Txt>
            <Button
              title="Search"
              onPress={() => router.push({ pathname: "/trips/unsplash", params: { q: searchFor } })}
              style={{ minHeight: 36, paddingHorizontal: space.lg }}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}
          >
            {featured == null
              ? // Rippling placeholders while the photos load.
                [0, 1, 2, 3].map((i) => <Skeleton key={i} width={110} height={150} rounded={16} order={i} />)
              : featured.map((p, i) => {
                  const on = cover?.kind === "unsplash" && cover.photo.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={withTap(() => onCover({ kind: "unsplash", photo: p }))}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Photo by ${p.author}`}
                      accessibilityState={{ selected: on }}>
                      {/* The ripple stays behind each photo until it has loaded. */}
                      <Skeleton width={110} height={150} rounded={16} order={i} style={StyleSheet.absoluteFill} />
                      <Image source={{ uri: p.thumb }} style={[styles.tile, ring(on)]} contentFit="cover" transition={200} />
                    </Pressable>
                  );
                })}
          </ScrollView>
          {cover?.kind === "unsplash" ? (
            <Txt variant="caption" tone="tertiary">
              Photo by {cover.photo.author} on Unsplash
            </Txt>
          ) : null}
        </View>
      ) : null}

      {/* Colours */}
      <View
        style={[styles.card, { backgroundColor: c.surface, paddingRight: 0 }]}
      >
        <Txt variant="title2" style={{ fontWeight: "700" }}>
          Colours
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}
        >
          {COVER_COLORS.map((col, i) => {
            const on = cover?.kind === "color" && cover.index === i;
            return (
              <Pressable
                key={col.id}
                onPress={() => {
                  haptic.select();
                  onCover({ kind: "color", index: i });
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Colour ${i + 1}`}
                accessibilityState={{ checked: on }}
              >
                <LinearGradient
                  colors={col.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.4, y: 1 }}
                  style={[styles.tile, ring(on)]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  dot: { height: 8, borderRadius: 4 },
  namePage: { justifyContent: "space-between" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    paddingHorizontal: space.xl,
    minHeight: 64,
  },
  input: { flex: 1, fontSize: 20, paddingVertical: space.md },
  card: { borderRadius: radius.xl, padding: space.lg, gap: space.md },
  revealRow: { flexDirection: "row", alignItems: "flex-start" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tile: { width: 110, height: 150, borderRadius: 16 },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  previewTop: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewBottom: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: 0,
  },
  credit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: space.lg,
    height: 44,
    maxWidth: 220,
  },
  creditIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
