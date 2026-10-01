import { quran } from "@sanad/shared/content/quran";
import { findCollection, type Item } from "@sanad/shared/content/ruqyah";
import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AppText, Card, Screen } from "@/components/ui";
import { space, useColors } from "@/theme";

/** قارئ الورد: نص الآيات والأدعية من الحزمة المشتركة كما هو حرفياً (ADR-0016). */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collection = findCollection(id);
  if (!collection) {
    return (
      <Screen>
        <AppText>لم نجد هذا الورد.</AppText>
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: collection.title }} />
      <AppText variant="muted">{collection.intro}</AppText>
      {collection.items.map((item, i) => (
        <ItemCard key={i} item={item} />
      ))}
    </Screen>
  );
}

function ItemCard({ item }: { item: Item }) {
  const c = useColors();
  return (
    <Card>
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
      {item.repeat && item.repeat > 1 ? (
        <View style={{ alignSelf: "flex-start", marginTop: space.xs, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: c.successBg }}>
          <AppText style={{ color: c.success }}>{`${toArabicDigits(item.repeat)} مرات`}</AppText>
        </View>
      ) : null}
    </Card>
  );
}

const toArabicDigits = (n: number) => n.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
