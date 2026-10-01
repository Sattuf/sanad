import { AppText, Card, Screen } from "@/components/ui";

// هيكل مؤقت — يُبنى في الأسابيع 4–7 من docs/mobile-app-plan.md
export default function DirectoryScreen() {
  return (
    <Screen>
      <AppText variant="title">دليل المختصين</AppText>
      <Card>
        <AppText>البحث في الجهات والمختصين الموثّقين والحجز</AppText>
        <AppText variant="muted">قيد البناء</AppText>
      </Card>
    </Screen>
  );
}
