import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/ui/layout';
import { Button, Icon, Txt } from '@/ui/primitives';
import { space, useTheme } from '@/ui/theme';

/** Shown only after the server has confirmed the upload(s). */
export default function Saved() {
  const { count } = useLocalSearchParams<{ count?: string }>();
  const router = useRouter();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { readableWidth } = useLayout();
  const n = Math.max(1, Number(count ?? 1));

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  return (
    <View style={{ alignItems: 'center', padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
      <Icon name="checkmark.seal.fill" size={44} color={c.success} />
      <View style={{ gap: space.xs, width: readableWidth }} accessible accessibilityRole="alert">
        <Txt variant="title2" style={{ textAlign: 'center' }}>
          {n === 1 ? 'Memory saved.' : `${n} memories saved.`}
        </Txt>
        <Txt variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          {n === 1 ? 'See it when your trip ends.' : 'See them when your trip ends.'}
        </Txt>
      </View>
      <Button title="Done" onPress={() => router.back()} style={{ width: readableWidth }} />
    </View>
  );
}
