import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { fonts, useColors } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={color} size={size} />,
});

// تبويبات المستفيد في الإصدار 1.0 (docs/mobile-app-plan.md §1)
export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.body },
        headerTitleStyle: { fontFamily: fonts.bold },
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
      }}
    >
      <Tabs.Screen name="index" options={tab("الرئيسية", "home-outline")} />
      <Tabs.Screen name="ruqyah" options={tab("الرقية", "book-outline")} />
      <Tabs.Screen name="library" options={tab("المكتبة", "headset-outline")} />
      <Tabs.Screen name="directory" options={tab("الدليل", "people-outline")} />
      <Tabs.Screen name="account" options={tab("حسابي", "person-circle-outline")} />
    </Tabs>
  );
}
