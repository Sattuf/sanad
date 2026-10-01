import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from "react-native";
import { fonts, radius, space, useColors } from "@/theme";
import { MiniPlayer } from "./MiniPlayer";

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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.screen, contentStyle]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <MiniPlayer />
    </View>
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

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({ label, onPress, variant = "primary", busy, disabled, icon }: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const c = useColors();
  const inactive = disabled || busy;
  const bg = variant === "primary" ? c.primary : variant === "secondary" ? c.surface : "transparent";
  const fg = variant === "primary" ? c.primaryContrast : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === "secondary" ? c.border : "transparent", opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <AppText style={{ color: fg, fontFamily: fonts.bold }}>{label}</AppText>
    </Pressable>
  );
}

export function TextField({ label, hint, ltr, ...props }: TextInputProps & { label: string; hint?: string; ltr?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <AppText style={{ fontFamily: fonts.bold }}>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        // البريد والأرقام وكلمات المرور تُكتب من اليسار لليمين حتى في واجهة عربية
        style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text, textAlign: ltr ? "left" : "right", writingDirection: ltr ? "ltr" : "rtl" }]}
      />
      {hint ? <AppText variant="muted">{hint}</AppText> : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs }}
    >
      <View style={[styles.box, { borderColor: checked ? c.primary : c.border, backgroundColor: checked ? c.primary : c.surface }]}>
        {checked ? <Text style={{ color: c.primaryContrast, fontSize: 14, lineHeight: 18 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <AppText>{children}</AppText> : children}</View>
    </Pressable>
  );
}

export function Banner({ tone, children }: { tone: "danger" | "success" | "info"; children: ReactNode }) {
  const c = useColors();
  const [fg, bg] = tone === "danger" ? [c.danger, c.dangerBg] : tone === "success" ? [c.success, c.successBg] : [c.text, c.surface2];
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}>
      <AppText style={{ color: fg }}>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontFamily: fonts.body, fontSize: 16 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  base: { fontFamily: fonts.body, fontSize: 16, lineHeight: 28, writingDirection: "rtl" },
  screen: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
});
