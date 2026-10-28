import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from './layout';
import { space, useTheme } from './theme';

/**
 * Standard body for form sheets: content starts below the (transparent, iOS 26)
 * sheet header, scrolls if needed, and the primary actions are pinned to the
 * bottom of the sheet, rising with the keyboard.
 */
export function SheetLayout({
  children,
  footer,
  bottom,
}: {
  children: ReactNode;
  /** Pinned below the scroll area. */
  footer?: ReactNode;
  /** Secondary actions after the content, set apart by extra space (e.g. destructive rows). */
  bottom?: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { readableWidth } = useLayout();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={{ width: readableWidth, gap: space.xl }}>
          {children}
          {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
        </View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg), borderTopColor: c.border }]}>
          <View style={{ width: readableWidth, gap: space.md }}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xl },
  bottom: { marginTop: space.md },
  footer: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
