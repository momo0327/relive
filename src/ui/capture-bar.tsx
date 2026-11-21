import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from './haptics';
import { Breathing } from './skeleton';
import { useLayout } from './layout';
import { Icon } from './primitives';
import { lockedCardColors, space, useTheme } from './theme';

/** Height to leave free at the bottom of scrolling content above the bar. */
export const CAPTURE_BAR_SPACE = 128;

/**
 * Bottom action bar on a locked trip: Upload and Invite share one glass pill
 * on the left; the camera has its own, highlighted round button on the right.
 */
export function CaptureBar({
  onUpload,
  onCamera,
  onInvite,
  uploading = false,
}: {
  onUpload: () => void;
  onCamera: () => void;
  onInvite: () => void;
  uploading?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View
      style={[styles.bar, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, space.lg) }]}
      pointerEvents="box-none">
      {/* Same tinted glass as the Memories / Members pills above it. */}
      <View
        style={[
          styles.pill,
          styles.pillBorder,
          lockedCardColors(c.scheme),
          // A soft shadow so it floats above the page.
          { shadowOpacity: c.scheme === 'dark' ? 0.45 : 0.14 },
        ]}>
        <PillButton icon="photo.fill.on.rectangle.fill" label="Upload" busy={uploading} onPress={onUpload} />
        <PillButton icon="person.fill.badge.plus" label="Invite" onPress={onInvite} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Camera"
        accessibilityHint="Take photos and videos for this trip"
        onPress={() => {
          haptic.impact();
          onCamera();
        }}
        style={({ pressed }) => [styles.camera, { backgroundColor: c.text, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
        <Icon name="camera.fill" size={28} color={c.background} />
      </Pressable>
    </View>
  );
}

/** Icon button inside the pill, with a rounded highlight while pressed (like Photos' bottom bar). */
function PillButton({
  icon,
  label,
  busy,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      disabled={busy}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.pillButton, pressed && { backgroundColor: c.border }]}>
      <Breathing active={!!busy}>
        <Icon name={icon} size={26} color={c.text} />
      </Breathing>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  pillBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, height: 68, padding: 4, gap: 2 },
  pillButton: { alignItems: 'center', justifyContent: 'center', width: 76, height: 60, borderRadius: 30 },
  camera: { alignItems: 'center', justifyContent: 'center', width: 68, height: 68, borderRadius: 34 },
});
