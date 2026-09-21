// apps/mobile/app/(tabs)/_layout.tsx
// Instagram layout per CLAUDE.md nav: Home = Threads · + = Record · Profile = Voice notes · top-right = Life.
// Explore (Rising) and Reels (Boards) join the bar when those surfaces exist.

import { Link, Tabs } from 'expo-router'
import { Pressable } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { color } from '@/lib/theme'

function LifeButton() {
  return (
    <Link href="/life" asChild>
      <Pressable hitSlop={12} accessibilityLabel="Life inbox" style={{ marginRight: 16 }}>
        <SymbolView name="tray" tintColor={color.ink} size={22} />
      </Pressable>
    </Link>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.paper },
        headerShadowVisible: false,
        headerTitleStyle: { color: color.ink, fontWeight: '700' },
        headerRight: () => <LifeButton />,
        tabBarShowLabel: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.unsure,
        tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.line },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Threads',
          tabBarAccessibilityLabel: 'Threads',
          tabBarIcon: ({ color: c }) => <SymbolView name="house" tintColor={c} size={24} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarAccessibilityLabel: 'Record',
          tabBarIcon: () => <SymbolView name="plus.circle.fill" tintColor={color.accent} size={34} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Voice notes',
          tabBarAccessibilityLabel: 'Voice notes',
          tabBarIcon: ({ color: c }) => <SymbolView name="waveform" tintColor={c} size={24} />,
        }}
      />
    </Tabs>
  )
}
