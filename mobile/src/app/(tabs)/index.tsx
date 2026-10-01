import { ar } from "@sanad/shared/i18n/ar";
import { router } from "expo-router";
import { AppText, Card, RowLink, Screen } from "@/components/ui";

export default function HomeScreen() {
  return (
    <Screen>
      <AppText variant="title">{ar.app.name}</AppText>
      <AppText variant="muted">{ar.app.tagline}</AppText>
      <RowLink title="أذكار الصباح والمساء" subtitle="وردك اليومي" onPress={() => router.push("/ruqyah/morning-evening")} />
      <RowLink title={ar.nav.ruqyah} subtitle="آيات وأدعية من الكتاب والسنة" onPress={() => router.push("/ruqyah")} />
      <RowLink title={ar.nav.health} subtitle="توعية عامة: العلاج المشروع والرقية معاً" onPress={() => router.push("/health")} />
      <RowLink title="إن كنت في خطر الآن" subtitle="أرقام الطوارئ" onPress={() => router.push("/emergency")} />
      <Card>
        <AppText variant="muted">سند منصة توثيق وحجز إداري، لا تشخّص ولا تعالج ولا تعد بنتيجة. سند مجانية بالكامل، لا اشتراكات ولا خدمات مدفوعة.</AppText>
      </Card>
    </Screen>
  );
}
