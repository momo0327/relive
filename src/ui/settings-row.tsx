import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { withTap } from './haptics';
import { Icon, Txt } from './primitives';
import { space, useTheme } from './theme';

/**
 * Grouped-list row (Settings, Trip Options): leading icon or element, label,
 * optional trailing control, chevron, and an inset separator.
 */
export function SettingsRow({
  icon,
  leading,
  label,
  detail,
  chevron,
  destructive,
  last,
  onPress,
  accessibilityHint,
  children,
}: {
  icon?: SymbolViewProps['name'];
  /** Custom leading element (e.g. an avatar) instead of an icon. */
  leading?: ReactNode;
  label: string;
  /** Secondary text on the right (e.g. "Organizer"). */
  detail?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  children?: ReactNode;
}) {
  const c = useTheme();
  const tint = destructive ? c.danger : c.text;
  const content = (
    <>
      <View style={[styles.lead, leading ? styles.leadWide : null]}>
        {leading ?? (icon ? <Icon name={icon} size={20} color={tint} weight="regular" /> : null)}
      </View>
      <View style={[styles.body, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
        <Txt variant="body" style={{ flex: 1, color: tint }} numberOfLines={1}>
          {label}
        </Txt>
        {detail}
        {children ? <View style={styles.accessory}>{children}</View> : null}
        {chevron ? <Icon name="chevron.right" size={14} color={c.textTertiary} weight="semibold" /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible={!children} accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={withTap(onPress)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.border }]}>
      {content}
    </Pressable>
  );
}

/** Rounded group container for SettingsRow. */
export function SettingsCard({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: space.lg },
  lead: { width: 28, alignItems: 'flex-start', justifyContent: 'center', marginRight: space.md },
  leadWide: { width: 40 },
  // Fixed-height box so native controls (iOS 26 switches are sized
  // differently from their React Native frame) stay vertically centred.
  accessory: { height: 56, justifyContent: 'center', alignItems: 'flex-end' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingRight: space.lg },
});
