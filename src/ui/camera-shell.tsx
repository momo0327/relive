import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/ui/layout';
import { space } from '@/ui/theme';

const VIEWFINDER_RADIUS = 36;
/** Height of the row under the main controls (Photo / Video), kept on the preview too so nothing moves. */
const BELOW_HEIGHT = 36;
const CONTROLS_HEIGHT = 82;

/**
 * Shared frame for the camera and the capture preview: a viewport rounded
 * where it meets the black control area, then one row of controls and a row
 * below it. Same sizes on both screens, so going from camera to preview
 * doesn't move anything.
 */
export function CameraShell({
  viewport,
  viewportProps,
  controls,
  below,
}: {
  viewport: ReactNode;
  /** e.g. touch handlers on the viewfinder. */
  viewportProps?: ViewProps;
  controls: ReactNode;
  below?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { landscape } = useLayout();
  return (
    <View style={[styles.root, landscape && { flexDirection: 'row' }]}>
      <View
        {...viewportProps}
        style={[
          styles.viewport,
          landscape
            ? { borderTopRightRadius: VIEWFINDER_RADIUS, borderBottomRightRadius: VIEWFINDER_RADIUS }
            : { borderBottomLeftRadius: VIEWFINDER_RADIUS, borderBottomRightRadius: VIEWFINDER_RADIUS },
        ]}>
        {viewport}
      </View>
      <View
        style={
          landscape
            ? { width: 150 + insets.right, paddingRight: insets.right, alignItems: 'center', justifyContent: 'center', gap: space.xl }
            : { paddingTop: space.xl, paddingBottom: insets.bottom + space.md, gap: space.lg }
        }>
        <View style={[styles.controls, landscape && { flexDirection: 'column-reverse', gap: space.xl }]}>{controls}</View>
        <View style={[styles.below, landscape && { height: undefined }]}>{below}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#111' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', minHeight: CONTROLS_HEIGHT },
  below: { height: BELOW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
});
