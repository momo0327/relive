import type { SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Txt } from './primitives';
import { SkeletonPage } from './skeleton';
import { space, useTheme } from './theme';

/** Loading placeholder: rippling skeleton blocks instead of a spinner. */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <SkeletonPage label={label} />;
}

export function MessageState({
  icon,
  title,
  message,
  action,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  message?: string;
  action?: { title: string; onPress: () => void };
}) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <Icon name={icon} size={40} color={c.textTertiary} />
      <Txt variant="title2" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {message ? (
        <Txt variant="callout" tone="secondary" style={{ textAlign: 'center', maxWidth: 420 }}>
          {message}
        </Txt>
      ) : null}
      {action ? <Button title={action.title} kind="secondary" onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <MessageState icon="exclamationmark.triangle" title="Couldn’t load" message={message} action={{ title: 'Try again', onPress: onRetry }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
});
