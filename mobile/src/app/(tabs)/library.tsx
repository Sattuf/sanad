import { AppText, Card, Screen } from "@/components/ui";

// هيكل مؤقت — يُبنى في الأسابيع 4–7 من docs/mobile-app-plan.md
export default function LibraryScreen() {
  return (
    <Screen>
      <AppText variant="title">المكتبة الصوتية</AppText>
      <Card>
        <AppText>التلاوات والأدعية مع التشغيل في الخلفية</AppText>
        <AppText variant="muted">قيد البناء</AppText>
      </Card>
    </Screen>
  );
}
