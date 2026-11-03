import type { SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from './haptics';
import { useLayout } from './layout';
import { Glass, Icon } from './primitives';
import { space, useTheme } from './theme';

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
      <Glass interactive style={styles.pill}>
        <PillButton icon="photo.fill" label="Upload" busy={uploading} onPress={onUpload} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <PillButton icon="link" label="Invite" onPress={onInvite} />
      </Glass>
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
      style={({ pressed }) => [styles.pillButton, { opacity: pressed ? 0.6 : 1 }]}>
      {busy ? <ActivityIndicator color={c.text} /> : <Icon name={icon} size={24} color={c.text} />}
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
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, height: 68, paddingHorizontal: space.xs },
  pillButton: { alignItems: 'center', justifyContent: 'center', width: 70, height: 68 },
  divider: { width: StyleSheet.hairlineWidth, height: 24 },
  camera: { alignItems: 'center', justifyContent: 'center', width: 68, height: 68, borderRadius: 34 },
});
