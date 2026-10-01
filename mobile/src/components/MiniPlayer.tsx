import Ionicons from "@expo/vector-icons/Ionicons";
import { formatDuration } from "@sanad/shared/lib/format";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePlayer } from "@/lib/player";
import { fonts, space, useColors } from "@/theme";

/** شريط التشغيل الحالي — أسفل كل شاشة ما دام هناك مقطع. */
export function MiniPlayer() {
  const c = useColors();
  const { track, playing, buffering, position, duration, toggle, stop } = usePlayer();
  if (!track) return null;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      <View style={[styles.progress, { backgroundColor: c.border }]}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.primary }} />
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? "إيقاف مؤقت" : "تشغيل"} onPress={toggle} hitSlop={10}>
          <Ionicons name={buffering ? "hourglass-outline" : playing ? "pause-circle" : "play-circle"} size={40} color={c.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          {/* Text مباشرة لا AppText: ui.tsx يستورد هذا المكوّن */}
          <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 15, color: c.text }}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>
            {duration > 0 ? `${formatDuration(position)} / ${formatDuration(duration)} · ${track.subtitle}` : track.subtitle}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق المشغّل" onPress={stop} hitSlop={10}>
          <Ionicons name="close" size={24} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth },
  progress: { height: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
