import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle } from "react-native";
import { fonts, radius, space, useColors } from "@/theme";

type Variant = "body" | "title" | "heading" | "muted" | "dua" | "quran";

/** نص عربي بخط الهوية. quran للآيات (Amiri Quran) وdua للأدعية (Amiri). */
export function AppText({ variant = "body", style, ...props }: TextProps & { variant?: Variant }) {
  const c = useColors();
  return <Text {...props} style={[styles.base, { color: c.text }, variantStyle(variant, c.muted), style]} />;
}

function variantStyle(v: Variant, muted: string) {
  switch (v) {
    case "title":
      return { fontFamily: fonts.bold, fontSize: 26, lineHeight: 40 };
    case "heading":
      return { fontFamily: fonts.bold, fontSize: 18, lineHeight: 30 };
    case "muted":
      return { color: muted, fontSize: 14, lineHeight: 24 };
    case "dua":
      return { fontFamily: fonts.dua, fontSize: 21, lineHeight: 40 };
    case "quran":
      return { fontFamily: fonts.quran, fontSize: 23, lineHeight: 50 };
    default:
      return null;
  }
}

export function Screen({ children, contentStyle }: { children: ReactNode; contentStyle?: ViewStyle }) {
  const c = useColors();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.screen, contentStyle]} contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

/** صف قابل للضغط بعنوان ووصف — للقوائم (الأوراد، الأقسام). */
export function RowLink({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? c.surface2 : c.surface, borderColor: c.border }]}
    >
      <AppText variant="heading">{title}</AppText>
      {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: fonts.body, fontSize: 16, lineHeight: 28, writingDirection: "rtl" },
  screen: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
});
