import { quran } from "@sanad/shared/content/quran";
import { findCollection } from "@sanad/shared/content/ruqyah";
import { buildEntries, target, type Entry } from "@sanad/shared/content/wird";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText, Button, Card, Screen } from "@/components/ui";
import { usePublishedDuas, useWirdProgress } from "@/lib/wird";
import { radius, space, useColors } from "@/theme";

const toArabicDigits = (n: number) => n.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/**
 * قارئ الورد: نص الآيات والأدعية من الحزمة المشتركة كما هو حرفياً (ADR-0016)، مع عدّاد بالنقر على البطاقة.
 * التقدّم في الجهاز فوراً، ويُزامَن مع الحساب لمن سجّل دخوله.
 */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collection = findCollection(id);
  const duas = usePublishedDuas();
  const entries = useMemo(() => (collection ? buildEntries(collection.id, collection.items, duas.data) : []), [collection, duas.data]);
  const progress = useWirdProgress(collection?.id ?? "", entries);

  if (!collection) {
    return (
      <Screen>
        <AppText>لم نجد هذا الورد.</AppText>
      </Screen>
    );
  }
  const done = entries.length > 0 && progress.completed === entries.length;

  return (
    <Screen>
      <Stack.Screen options={{ title: collection.title }} />
      <AppText variant="muted">{collection.intro}</AppText>
      <ProgressBar value={progress.completed} total={entries.length} />
      <AppText variant="muted">
        {done ? "أتممت وردك اليوم — تقبّل الله منك." : `أتممت ${toArabicDigits(progress.completed)} من ${toArabicDigits(entries.length)}. انقر على البطاقة لتعدّ.`}
        {progress.synced ? " يُحفظ في حسابك." : ""}
      </AppText>
      {entries.map((entry) => (
        <ItemCard key={entry.key} entry={entry} count={progress.counts[entry.key] ?? 0} onPress={() => progress.bump(entry)} />
      ))}
      {progress.completed > 0 ? <Button label="ابدأ من جديد" variant="ghost" onPress={progress.reset} /> : null}
    </Screen>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const c = useColors();
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }} style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.success }} />
    </View>
  );
}

function ItemCard({ entry, count, onPress }: { entry: Entry; count: number; onPress: () => void }) {
  const c = useColors();
  const { item } = entry;
  const goal = target(item);
  const finished = count >= goal;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}، ${finished ? "مكتمل" : `${count} من ${goal}`}`}
      accessibilityHint="انقر لتعدّ مرة"
      disabled={finished}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={finished ? { borderColor: c.success } : undefined}>
        <AppText variant="heading">{item.title}</AppText>
        {item.kind === "quran" ? (
          <AppText variant="quran">{quran[item.ref].ayat.map((a, i) => `${a} ﴿${toArabicDigits(quran[item.ref].from + i)}﴾`).join(" ")}</AppText>
        ) : (
          <>
            <AppText variant="dua">{item.text}</AppText>
            <AppText variant="muted">{item.source}</AppText>
          </>
        )}
        {item.note ? <AppText variant="muted">{item.note}</AppText> : null}
        <View style={{ alignSelf: "flex-start", marginTop: space.xs, paddingHorizontal: space.md, borderRadius: radius.xl, backgroundColor: finished ? c.successBg : c.surface2 }}>
          <AppText style={{ color: finished ? c.success : c.muted }}>{finished ? "✓ تم" : `${toArabicDigits(count)} / ${toArabicDigits(goal)}`}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}
