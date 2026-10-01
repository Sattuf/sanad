import { AppText, Card, Screen } from "@/components/ui";

// هيكل مؤقت — يُبنى في الأسابيع 2–4 من docs/mobile-app-plan.md
export default function AccountScreen() {
  return (
    <Screen>
      <AppText variant="title">حسابي</AppText>
      <Card>
        <AppText>الدخول بالبريد أو الهاتف أو Google أو Apple</AppText>
        <AppText variant="muted">قيد البناء</AppText>
      </Card>
    </Screen>
  );
}
