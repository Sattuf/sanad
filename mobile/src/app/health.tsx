import { healthGuides } from "@sanad/shared/content/ruqyah";
import { router } from "expo-router";
import { AppText, Button, Card, RowLink, Screen } from "@/components/ui";

/** «الصحة والطمأنينة»: توعية عامة تجمع العلاج المشروع والرقية — لا تشخيص ولا جرعات. */
export default function HealthScreen() {
  return (
    <Screen>
      <AppText variant="muted">الأخذ بالأسباب الطبية لا يعارض الرقية والتوكل. هذه توعية عامة، لا تشخيص ولا علاج.</AppText>
      <Card>
        <AppText>إن كانت لديك أفكار بإيذاء نفسك أو غيرك فلا تنتظر.</AppText>
        <Button label="أرقام الطوارئ" onPress={() => router.push("/emergency")} />
      </Card>
      {healthGuides.map((g) => (
        <RowLink key={g.id} title={g.title} subtitle={g.subtitle} onPress={() => router.push({ pathname: "/guide/[id]", params: { id: g.id } })} />
      ))}
      <Button label="ابحث عن طبيب مرخّص في الدليل" variant="secondary" onPress={() => router.navigate({ pathname: "/directory", params: { track: "LicensedHealth" } })} />
    </Screen>
  );
}
