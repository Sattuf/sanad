import { collections, groups, type CollectionGroup } from "@sanad/shared/content/ruqyah";
import { router } from "expo-router";
import { AppText, RowLink, Screen } from "@/components/ui";

const order: CollectionGroup[] = ["prevention", "treatment", "relief"];

export default function RuqyahScreen() {
  return (
    <Screen>
      {order.map((group) => (
        <Section key={group} group={group} />
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
