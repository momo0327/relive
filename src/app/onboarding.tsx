import type { SymbolViewProps } from 'expo-symbols';
import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { useA11yPrefs } from '@/ui/a11y';
import { useLayout } from '@/ui/layout';
import { Button, Icon, Row, Txt } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const pages: { icon: SymbolViewProps['name']; title: string; body: string }[] = [
  {
    icon: 'camera.on.rectangle',
    title: 'Capture together',
    body: 'Create a trip, invite your friends, and everyone adds photos and short videos as it happens.',
  },
  {
    icon: 'lock.fill',
    title: 'Everything stays hidden',
    body: 'Once a memory is added, nobody can peek. Not even you. Stay in the moment and keep the phone in your pocket.',
  },
  {
    icon: 'sparkles',
    title: 'The big reveal',
    body: 'When the trip ends, every memory unlocks at once in a shared gallery for the whole group.',
  },
];

export default function Onboarding() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const { readableWidth } = useLayout();
  const { reduceMotion } = useA11yPrefs();
  const { completeOnboarding } = useSession();
  const [index, setIndex] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const last = index === pages.length - 1;

  function goTo(i: number) {
    scroller.current?.scrollTo({ x: i * width, animated: !reduceMotion });
    setIndex(i);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <Row style={{ justifyContent: 'flex-end', paddingHorizontal: space.lg, minHeight: 44 }}>
        {!last ? <Button title="Skip" kind="plain" onPress={completeOnboarding} style={{ minHeight: 44 }} /> : null}
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}>
        {pages.map((page, i) => (
          <ScrollView showsVerticalScrollIndicator={false}
            key={page.title}
            style={{ width }}
            contentContainerStyle={styles.page}
            accessibilityElementsHidden={i !== index}
            importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}>
            <View style={{ width: readableWidth, gap: space.xl, alignItems: 'center' }}>
              <View style={[styles.badge, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
                <Icon name={page.icon} size={56} color={i === 1 ? c.locked : c.accent} />
              </View>
              <Txt variant="largeTitle" style={{ textAlign: 'center' }} accessibilityRole="header">
                {page.title}
              </Txt>
              <Txt variant="body" tone="secondary" style={{ textAlign: 'center' }}>
                {page.body}
              </Txt>
            </View>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={{ alignItems: 'center', gap: space.xl, padding: space.xl }}>
        <View accessible accessibilityLabel={`Page ${index + 1} of ${pages.length}`} style={{ flexDirection: 'row', gap: space.sm }}>
          {pages.map((p, i) => (
            <View
              key={p.title}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? c.text : c.textTertiary,
              }}
            />
          ))}
        </View>
        <Button
          title={last ? 'Get Started' : 'Next'}
          onPress={() => (last ? completeOnboarding() : goTo(index + 1))}
          style={{ width: readableWidth }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  badge: {
    width: 128,
    height: 128,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
