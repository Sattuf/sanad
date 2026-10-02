import { awarenessGuides, collections, groups, methodGuides, type CollectionGroup } from "@sanad/shared/content/ruqyah";
import { slotForHour } from "@sanad/shared/content/wird";
import { router } from "expo-router";
import { AppText, RowLink, Screen } from "@/components/ui";

const order: CollectionGroup[] = ["prevention", "treatment", "relief"];

export default function RuqyahScreen() {
  const now = slotForHour(new Date().getHours());
  return (
    <Screen>
      {now ? (
        <RowLink title={`حان وقت ${now.label}`} subtitle="افتح وردك الآن" onPress={() => router.push({ pathname: "/ruqyah/[id]", params: { id: now.collection } })} />
      ) : null}
      <RowLink title="تذكير الأذكار" subtitle="الصباح والمساء والنوم — إشعار في وقته" onPress={() => router.push("/reminders")} />
      {order.map((group) => (
        <Section key={group} group={group} />
      ))}
      <AppText variant="heading">المنهج والتوعية</AppText>
      {[...methodGuides, ...awarenessGuides].map((g) => (
        <RowLink key={g.id} title={g.title} subtitle={g.subtitle} onPress={() => router.push({ pathname: "/guide/[id]", params: { id: g.id } })} />
      ))}
    </Screen>
  );
}

function Section({ group }: { group: CollectionGroup }) {
  const items = collections.filter((c) => c.group === group);
  if (items.length === 0) return null;
  return (
    <>
      <AppText variant="heading">{groups[group].title}</AppText>
      <AppText variant="muted">{groups[group].text}</AppText>
      {items.map((c) => (
        <RowLink key={c.id} title={c.title} subtitle={c.subtitle} onPress={() => router.push({ pathname: "/ruqyah/[id]", params: { id: c.id } })} />
      ))}
    </>
  );
}
