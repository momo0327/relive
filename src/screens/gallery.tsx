import SegmentedControlClass, { type SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Platform,
  PlatformColor,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, plural } from '@/lib/format';
import { markRecapSeen, recapSeen, setRecapData } from '@/lib/recap';
import { useSession } from '@/lib/session';
import { useExportMemories, type ExportProgress } from '@/lib/use-export-memories';
import type { MediaItem, TripDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useVideoThumbnail } from '@/lib/video-thumbs';
import { setViewerItems } from '@/lib/viewer-cache';
import { useA11yPrefs } from '@/ui/a11y';
import { useLayout } from '@/ui/layout';
import { HERO_OVERLAP, TripHeroScroll } from '@/ui/trip-hero';
import { Icon, Row, Txt } from '@/ui/primitives';
import { SkeletonGrid } from '@/ui/skeleton';
import { ErrorState, MessageState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';
import { haptic, withTap } from '@/ui/haptics';

type Filter = 'all' | 'photo' | 'video' | 'liked';
const GAP = 10;

/** Tile aspect (height / width), clamped so very tall or wide shots stay tidy. */
function tileRatio(item: MediaItem) {
  if (!item.width || !item.height) return 1;
  return Math.min(1.5, Math.max(0.7, item.height / item.width));
}

/** Distributes items into columns, always adding to the shortest one. */
function masonry(items: MediaItem[], columns: number) {
  const cols: { item: MediaItem; index: number }[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  items.forEach((item, index) => {
    const target = heights.indexOf(Math.min(...heights));
    cols[target].push({ item, index });
    heights[target] += tileRatio(item);
  });
  return cols;
}

export function GalleryView({ trip, onStuckChange }: { trip: TripDetail; onStuckChange?: (stuck: boolean) => void }) {
  const router = useRouter();
  const c = useTheme();
  const { backend } = useSession();
  const { gutter, galleryColumns, width, contentWidth, regular } = useLayout();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, reload } = useLoad(() => backend.listMedia(trip.id), { refocusAfterMs: 5 * 60 * 1000 });

  // Hand the loaded memories to the recap; first time after the reveal, play it.
  useEffect(() => {
    if (data) setRecapData(trip, data);
    if (data && data.length > 0 && !recapSeen(trip.id)) {
      markRecapSeen(trip.id);
      router.push(`/trips/${trip.id}/recap`);
    }
  }, [data, trip, router]);
  // Selection mode for "Choose memories…" export; null when not selecting.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  // Filter's offset inside the gallery panel (below the recap card).
  const [filterY, setFilterY] = useState(0);
  // Windowing: tiles only load their image when near the screen.
  const { height: windowHeight } = useWindowDimensions();
  const [scrollY, setScrollY] = useState(0);
  const [gridTop, setGridTop] = useState(0);
  const windowTop = scrollY - windowHeight;
  const windowBottom = scrollY + windowHeight * 2;
  const exporter = useExportMemories(trip.id);

  const items = useMemo(
    () => (data ?? []).filter((m) => filter === 'all' || (filter === 'liked' ? m.liked : m.kind === filter)),
    [data, filter],
  );
  const columns = useMemo(() => masonry(items, galleryColumns), [items, galleryColumns]);
  const counts = useMemo(
    () => ({
      all: data?.length ?? 0,
      photo: data?.filter((m) => m.kind === 'photo').length ?? 0,
      video: data?.filter((m) => m.kind === 'video').length ?? 0,
      liked: data?.filter((m) => m.liked).length ?? 0,
    }),
    [data],
  );

  const gridWidth = regular ? contentWidth : width - gutter * 2;
  const columnWidth = (gridWidth - GAP * (galleryColumns - 1)) / galleryColumns;

  function open(index: number) {
    setViewerItems(trip.id, items, trip.isOwner, {
      tripName: trip.name,
      members: trip.members,
    });
    router.push(`/trips/${trip.id}/viewer?index=${index}`);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    Haptics.selectionAsync().catch(() => undefined);
  }

  async function saveSelected() {
    if (!selected?.size) return;
    const ok = await exporter.run(selected);
    if (ok) setSelected(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <TripHeroScroll
        trip={trip}
        // The filter stays pinned under the header while scrolling the grid.
        stickyHeader={
          counts.all > 0 ? (
            <View style={{ width: gridWidth }}>
              <FilterBar value={filter} onChange={setFilter} />
            </View>
          ) : undefined
        }
        stickyOffset={space.lg + filterY}
        onStuckChange={onStuckChange}
        onScrollY={setScrollY}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 120 }}>
        {/* Rounded panel that slides over the bottom of the banner. */}
        <View style={[styles.panel, { width, backgroundColor: c.background }]}>
          <View style={{ width: gridWidth, gap: space.lg, alignSelf: 'center' }}>
            {counts.all > 0 ? (
              <>
                <RecapCard total={counts.all} onPress={() => router.push(`/trips/${trip.id}/recap`)} />
                {/* Measured so the pinned copy appears exactly when this one reaches the header. */}
                <View onLayout={(e) => setFilterY(e.nativeEvent.layout.y)}>
                  <FilterBar value={filter} onChange={setFilter} />
                </View>
              </>
            ) : null}

            {!data ? (
              // The cover stays put while memories load; only this area waits.
              <View style={{ minHeight: 320 }}>
                {error ? (
                  <ErrorState message={error} onRetry={reload} />
                ) : (
                  <SkeletonGrid columns={galleryColumns} width={gridWidth} gap={GAP} />
                )}
              </View>
            ) : items.length === 0 ? (
              <View style={{ minHeight: 320 }}>
                <MessageState
                  icon="photo.on.rectangle.angled"
                  title={
                    counts.all === 0 ? 'No memories in this trip' : filter === 'liked' ? 'No favourites yet' : 'Nothing here'
                  }
                  message={
                    counts.all === 0
                      ? 'Nobody added photos or videos before the trip ended.'
                      : filter === 'liked'
                        ? 'Tap the heart on a photo or video to add it here.'
                        : 'Try another filter.'
                  }
                />
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  gap: GAP,
                  alignItems: 'flex-start',
                }}
                onLayout={(e) => setGridTop(e.nativeEvent.layout.y)}>
                {columns.map((col, ci) => {
                  let y = 0;
                  return (
                    <View key={ci} style={{ width: columnWidth, gap: GAP }}>
                      {col.map(({ item, index }) => {
                        const h = columnWidth * tileRatio(item);
                        // Page offset ≈ banner + panel padding + grid top + position in column.
                        const top = gridTop + y + 400;
                        y += h + GAP;
                        const near = top + h > windowTop && top < windowBottom;
                        return (
                          <Tile
                            key={item.id}
                            item={item}
                            width={columnWidth}
                            visible={near}
                            selected={selected ? selected.has(item.id) : undefined}
                            onPress={() => {
                              if (selected) toggle(item.id);
                              else {
                                haptic.tap();
                                open(index);
                              }
                            }}
                          />
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </TripHeroScroll>

      {counts.all > 0 ? (
        <ExportBar
          progress={exporter.progress}
          selectedCount={selected ? selected.size : null}
          allSelected={!!selected && items.length > 0 && items.every((m) => selected.has(m.id))}
          onExport={() => setSelected(new Set())}
          onToggleAll={() =>
            setSelected((prev) => (prev && items.every((m) => prev.has(m.id)) ? new Set() : new Set(items.map((m) => m.id))))
          }
          onCancel={() => setSelected(null)}
          onSave={saveSelected}
        />
      ) : null}
    </View>
  );
}

const glassSupported = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

/** White Liquid Glass pill (solid white fallback) for the floating export controls. */
function GlassPill({ children }: { children: React.ReactNode }) {
  const { reduceTransparency } = useA11yPrefs();
  return glassSupported && !reduceTransparency ? (
    <GlassView glassEffectStyle="regular" tintColor="rgba(255,255,255,0.9)" isInteractive style={styles.exportPill}>
      {children}
    </GlassView>
  ) : (
    <View style={[styles.exportPill, styles.exportFallback]}>{children}</View>
  );
}

/**
 * Floating export control. "Export memories" switches the gallery into
 * selection mode, where the bar becomes ✕ · Select all · Save N.
 */
function ExportBar({
  progress,
  selectedCount,
  allSelected,
  onExport,
  onToggleAll,
  onCancel,
  onSave,
}: {
  progress: ExportProgress;
  selectedCount: number | null;
  allSelected: boolean;
  onExport: () => void;
  onToggleAll: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const busy = progress !== null;
  const dark = '#0E0F10';
  const press = ({ pressed }: { pressed: boolean }) => ({
    transform: [{ scale: pressed ? 0.96 : 1 }],
  });

  let content: React.ReactNode;
  if (busy) {
    const label = progress.total ? `Saving ${progress.done} of ${progress.total}…` : 'Preparing…';
    content = (
      <View accessible accessibilityLabel={label} style={{ alignSelf: 'center' }}>
        <GlassPill>
          <Row gap={space.sm} style={styles.exportInner}>
            <ActivityIndicator color={dark} />
            <Txt variant="headline" style={{ color: dark }}>
              {label}
            </Txt>
          </Row>
        </GlassPill>
      </View>
    );
  } else if (selectedCount !== null) {
    content = (
      // ✕ on the left, Select all centred, Save on the right.
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: gutter }}>
        <Pressable onPress={withTap(onCancel)} accessibilityRole="button" accessibilityLabel="Cancel selection" style={press}>
          <GlassPill>
            <View style={styles.exportRound}>
              <Icon name="xmark" size={22} color={dark} weight="semibold" />
            </View>
          </GlassPill>
        </Pressable>
        <Pressable onPress={withTap(onToggleAll)} accessibilityRole="button" style={press}>
          <GlassPill>
            <Row style={styles.exportCompact}>
              <Txt variant="headline" style={{ color: dark }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Txt>
            </Row>
          </GlassPill>
        </Pressable>
        <Pressable
          onPress={withTap(onSave)}
          disabled={selectedCount === 0}
          accessibilityRole="button"
          accessibilityLabel={selectedCount ? `Save ${plural(selectedCount, 'memory', 'memories')} to Photos` : 'Save to Photos'}
          style={(state) => [press(state), { opacity: selectedCount === 0 ? 0.55 : 1 }]}>
          <GlassPill>
            <View style={styles.exportRound}>
              <Icon name="square.and.arrow.down" size={28} color={dark} weight="semibold" />
            </View>
          </GlassPill>
        </Pressable>
      </Row>
    );
  } else {
    content = (
      // Round button bottom-right, same size and style as the locked page's camera button.
      <Pressable
        onPress={withTap(onExport)}
        accessibilityRole="button"
        accessibilityLabel="Export memories"
        style={({ pressed }) => [
          styles.exportRoundButton,
          {
            right: gutter,
            backgroundColor: c.text,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}>
        <Icon name="square.and.arrow.down" size={28} color={c.background} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.exportWrap, { bottom: Math.max(insets.bottom, space.lg) + space.sm }]} pointerEvents="box-none">
      {content}
    </View>
  );
}

// The package's mixin class typing doesn't satisfy React 19's JSX types; the runtime component is fine.
const SegmentedControl = SegmentedControlClass as unknown as ComponentType<SegmentedControlProps>;

/** Entry point to the trip recap (also plays once automatically after the reveal). */
function RecapCard({ total, onPress }: { total: number; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Watch trip recap"
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.recap, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
      <Icon name="play.circle.fill" size={40} color={c.text} />
      <View style={{ flex: 1 }}>
        <Txt variant="headline">Trip recap</Txt>
        <Txt variant="footnote" tone="secondary" numberOfLines={1}>
          {plural(total, 'memory', 'memories')}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Matches the locked page's camera button. */
const BUTTON_SIZE = 68;

const segments: Filter[] = ['all', 'photo', 'video'];
const SEGMENT_TRACK = Platform.OS === 'ios' ? PlatformColor('tertiarySystemFill') : 'rgba(118,118,128,0.24)';
// iOS draws the selected segment as systemGray2 in dark mode and white in light mode.
const SEGMENT_SELECTED_DARK = Platform.OS === 'ios' ? PlatformColor('systemGray2') : '#636366';

/**
 * Native UISegmentedControl (Liquid Glass on iOS 26) for All / Photos / Videos,
 * plus a round heart button beside it for Favourites.
 */
function FilterBar({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const c = useTheme();
  const favourites = value === 'liked';
  return (
    <View style={styles.filterRow}>
      <View style={{ flex: 1 }}>
        <SegmentedControl
          values={['All', 'Photos', 'Videos']}
          // No segment highlighted while Favourites is on.
          selectedIndex={favourites ? -1 : segments.indexOf(value)}
          onChange={(e) => {
            haptic.select();
            onChange(segments[e.nativeEvent.selectedSegmentIndex] ?? 'all');
          }}
          appearance={c.scheme}
          accessibilityLabel="Filter memories"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Favourites"
        accessibilityState={{ selected: favourites }}
        onPress={() => {
          haptic.select();
          onChange(favourites ? 'all' : 'liked');
        }}
        // Off: the segmented control's track colour. On: its selected-segment colour.
        style={({ pressed }) => [
          styles.heart,
          {
            backgroundColor: favourites ? (c.scheme === 'dark' ? SEGMENT_SELECTED_DARK : '#FFFFFF') : SEGMENT_TRACK,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <Icon name={favourites ? 'heart.fill' : 'heart'} size={17} color={c.text} />
      </Pressable>
    </View>
  );
}

function Tile({
  item,
  width,
  visible,
  selected,
  onPress,
}: {
  item: MediaItem;
  width: number;
  /** Near the screen: load the image (once loaded, it stays). */
  visible: boolean;
  /** undefined = not selecting; otherwise whether this tile is chosen. */
  selected?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  // Once a tile has been near the screen, keep its image mounted (no flicker on scroll-back).
  const [seen, setSeen] = useState(visible);
  if (visible && !seen) setSeen(true);
  // Small server preview when there is one; otherwise the photo itself or a
  // first frame made on this device (older memories).
  const localFrame = useVideoThumbnail(item, seen && !item.thumbUrl);
  const source = item.thumbUrl ?? (item.kind === 'photo' ? item.url : localFrame);
  const label = `${item.kind === 'video' ? `Video, ${formatDuration(item.durationMs)}` : 'Photo'} by ${item.isMine ? 'you' : item.uploaderName}`;

  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'imagebutton' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View
        style={[
          styles.tile,
          {
            width,
            height: width * tileRatio(item),
            backgroundColor: c.surface,
          },
        ]}>
        {item.sampleColors ? (
          <LinearGradient colors={item.sampleColors} style={StyleSheet.absoluteFill} />
        ) : source && seen ? (
          <Image
            source={{
              uri: source,
              cacheKey: `media-${item.id}${item.kind === 'video' ? '-thumb' : ''}`,
            }}
            recyclingKey={item.id}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="disk"
            priority={visible ? 'high' : 'low'}
          />
        ) : null}
        {selected !== undefined ? (
          <>
            {!selected ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} /> : null}
            <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
              {selected ? <Icon name="checkmark" size={13} color="#fff" weight="bold" /> : null}
            </View>
          </>
        ) : null}
        {item.kind === 'video' ? (
          <View style={styles.duration}>
            <Txt variant="caption" style={{ color: '#fff', fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.3}>
              {formatDuration(item.durationMs, true)}
            </Txt>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderTopLeftRadius: HERO_OVERLAP,
    borderTopRightRadius: HERO_OVERLAP,
    paddingTop: space.lg,
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  checkOn: { backgroundColor: '#0A84FF' },
  checkOff: { backgroundColor: 'rgba(0,0,0,0.25)' },
  exportWrap: { position: 'absolute', left: 0, right: 0 },
  // Same size as the ✕ / Save buttons shown in selection mode.
  // All export controls share the locked page's 68 pt button size.
  exportRoundButton: {
    position: 'absolute',
    bottom: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportRound: { width: BUTTON_SIZE, height: BUTTON_SIZE, alignItems: 'center', justifyContent: 'center' },
  // Fixed width so it doesn't jump between "Select all" and "Deselect all".
  exportCompact: { width: 200, minHeight: BUTTON_SIZE, justifyContent: 'center' },
  exportPill: { borderRadius: radius.pill, overflow: 'hidden' },
  exportInner: { paddingHorizontal: space.xl, minHeight: BUTTON_SIZE },
  exportFallback: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tile: { borderRadius: 14, overflow: 'hidden' },
  duration: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
