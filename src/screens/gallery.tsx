import SegmentedControlClass, { type SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useExportMemories, type ExportProgress } from '@/lib/use-export-memories';
import type { MediaItem, TripDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { setViewerItems } from '@/lib/viewer-cache';
import { useA11yPrefs } from '@/ui/a11y';
import { useLayout } from '@/ui/layout';
import { HERO_OVERLAP, TripHeroScroll } from '@/ui/trip-hero';
import { Icon, Row, Txt } from '@/ui/primitives';
import { ErrorState, LoadingState, MessageState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';
import { haptic, withTap } from '@/ui/haptics';

type Filter = 'all' | 'photo' | 'video';
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

export function GalleryView({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const c = useTheme();
  const { backend } = useSession();
  const { gutter, galleryColumns, width, contentWidth, regular } = useLayout();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, reload } = useLoad(() => backend.listMedia(trip.id));
  // Selection mode for "Choose memories…" export; null when not selecting.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const exporter = useExportMemories(trip.id);

  const items = useMemo(() => (data ?? []).filter((m) => filter === 'all' || m.kind === filter), [data, filter]);
  const columns = useMemo(() => masonry(items, galleryColumns), [items, galleryColumns]);
  const counts = useMemo(
    () => ({
      all: data?.length ?? 0,
      photo: data?.filter((m) => m.kind === 'photo').length ?? 0,
      video: data?.filter((m) => m.kind === 'video').length ?? 0,
    }),
    [data],
  );


  const gridWidth = regular ? contentWidth : width - gutter * 2;
  const columnWidth = (gridWidth - GAP * (galleryColumns - 1)) / galleryColumns;

  function open(index: number) {
    setViewerItems(trip.id, items, trip.isOwner);
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
          {counts.all > 0 ? <FilterBar value={filter} onChange={setFilter} /> : null}

          {!data ? (
            // The cover stays put while memories load; only this area waits.
            <View style={{ minHeight: 320 }}>
              {error ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Loading memories" />}
            </View>
          ) : items.length === 0 ? (
            <View style={{ minHeight: 320 }}>
              <MessageState
                icon="photo.on.rectangle.angled"
                title={counts.all === 0 ? 'No memories in this trip' : 'Nothing here'}
                message={counts.all === 0 ? 'Nobody added photos or videos before the trip ended.' : 'Try another filter.'}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: GAP, alignItems: 'flex-start' }}>
              {columns.map((col, ci) => (
                <View key={ci} style={{ width: columnWidth, gap: GAP }}>
                  {col.map(({ item, index }) => (
                    <Tile
                      key={item.id}
                      item={item}
                      width={columnWidth}
                      selected={selected ? selected.has(item.id) : undefined}
                      onPress={() => {
                        if (selected) toggle(item.id);
                        else {
                          haptic.tap();
                          open(index);
                        }
                      }}
                    />
                  ))}
                </View>
              ))}
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
            setSelected((prev) =>
              prev && items.every((m) => prev.has(m.id)) ? new Set() : new Set(items.map((m) => m.id)),
            )
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
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const busy = progress !== null;
  const dark = '#0E0F10';
  const press = ({ pressed }: { pressed: boolean }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] });

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
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: gutter }}>
        <Row gap={space.sm}>
          <Pressable onPress={withTap(onCancel)} accessibilityRole="button" accessibilityLabel="Cancel selection" style={press}>
            <GlassPill>
              <View style={styles.exportRound}>
                <Icon name="xmark" size={18} color={dark} weight="semibold" />
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
        </Row>
        <Pressable
          onPress={withTap(onSave)}
          disabled={selectedCount === 0}
          accessibilityRole="button"
          accessibilityLabel={selectedCount ? `Save ${plural(selectedCount, 'memory', 'memories')} to Photos` : 'Save to Photos'}
          style={(state) => [press(state), { opacity: selectedCount === 0 ? 0.55 : 1 }]}>
          <GlassPill>
            <View style={styles.exportRound}>
              <Icon name="square.and.arrow.down" size={24} color={dark} weight="semibold" />
            </View>
          </GlassPill>
        </Pressable>
      </Row>
    );
  } else {
    content = (
      <Pressable onPress={withTap(onExport)} accessibilityRole="button" accessibilityLabel="Export memories" style={[press({ pressed: false }), { alignSelf: 'center' }]}>
        {({ pressed }) => (
          <View style={press({ pressed })}>
            <GlassPill>
              <Row gap={space.sm} style={styles.exportInner}>
                <Icon name="square.and.arrow.down.fill" size={17} color={dark} weight="semibold" />
                <Txt variant="headline" style={{ color: dark }}>
                  Export memories
                </Txt>
              </Row>
            </GlassPill>
          </View>
        )}
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

const filters: Filter[] = ['all', 'photo', 'video'];

/** Native UISegmentedControl, so iOS 26 renders it with the system Liquid Glass style. */
function FilterBar({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const c = useTheme();
  return (
    <SegmentedControl
      values={['All', 'Photos', 'Videos']}
      selectedIndex={filters.indexOf(value)}
      onChange={(e) => {
        haptic.select();
        onChange(filters[e.nativeEvent.selectedSegmentIndex] ?? 'all');
      }}
      appearance={c.scheme}
      accessibilityLabel="Filter memories"
    />
  );
}

const thumbnailCache = new Map<string, string>();

function useVideoThumbnail(item: MediaItem): string | null {
  const [uri, setUri] = useState(() => thumbnailCache.get(item.id) ?? null);
  useEffect(() => {
    if (item.kind !== 'video' || !item.url || thumbnailCache.has(item.id)) return;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(item.url, { time: 500, quality: 0.6 })
      .then((result) => {
        thumbnailCache.set(item.id, result.uri);
        if (!cancelled) setUri(result.uri);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item]);
  return uri;
}

function Tile({
  item,
  width,
  selected,
  onPress,
}: {
  item: MediaItem;
  width: number;
  /** undefined = not selecting; otherwise whether this tile is chosen. */
  selected?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const thumb = useVideoThumbnail(item);
  const source = item.kind === 'photo' ? item.url : thumb;
  const label = `${item.kind === 'video' ? `Video, ${formatDuration(item.durationMs)}` : 'Photo'} by ${item.isMine ? 'you' : item.uploaderName}`;

  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'imagebutton' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.tile, { width, height: width * tileRatio(item), backgroundColor: c.surface }]}>
        {item.sampleColors ? (
          <LinearGradient colors={item.sampleColors} style={StyleSheet.absoluteFill} />
        ) : source ? (
          <Image
            source={{ uri: source, cacheKey: `media-${item.id}${item.kind === 'video' ? '-thumb' : ''}` }}
            recyclingKey={item.id}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
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
  panel: { borderTopLeftRadius: HERO_OVERLAP, borderTopRightRadius: HERO_OVERLAP, paddingTop: space.lg },
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
  exportRound: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  exportCompact: { paddingHorizontal: space.lg, minHeight: 50 },
  exportPill: { borderRadius: radius.pill, overflow: 'hidden' },
  exportInner: { paddingHorizontal: space.xl, minHeight: 54 },
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
