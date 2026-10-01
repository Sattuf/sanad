import { ACCESS_LOG_ACTION_LABELS, ACCESS_LOG_ROLE_LABELS, isOptionalConsent } from "@sanad/shared/api/account";
import type { ConsentStatus } from "@sanad/shared/api/types";
import { ar } from "@sanad/shared/i18n/ar";
import { formatDate, formatDateTime } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppText, Banner, Button, Card, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { exportMyData } from "@/lib/accountData";
import { account, queryKeys } from "@/lib/queries";
import { space, useColors } from "@/theme";

/** الموافقات، ومن اطّلع على بياناتي، وتصدير البيانات، والوصول لحذف الحساب. */
export default function DataSettingsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const consents = useQuery({ queryKey: ["consent"], queryFn: account.consents });
  const history = useQuery({ queryKey: ["consent-history"], queryFn: account.consentHistory, enabled: showHistory });
  const accessLog = useQuery({ queryKey: ["access-log"], queryFn: account.accessLog });
  const toggle = useMutation({
    mutationFn: (s: ConsentStatus) => (s.accepted ? account.revokeConsent(s.type) : account.recordConsent(s.type)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consent"] });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  const exporter = useMutation({ mutationFn: exportMyData });

  return (
    <Screen>
      <Card>
        <AppText variant="heading">الموافقات</AppText>
        {consents.isLoading ? <ActivityIndicator color={c.primary} /> : null}
        {consents.data?.map((s) => (
          <View key={s.type} style={{ gap: space.xs, paddingVertical: space.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
              <AppText style={{ flex: 1 }}>{ar.consent[s.type]}</AppText>
              {s.needsReacceptance ? <Tag label="إصدار جديد" tone="primary" /> : null}
              {!isOptionalConsent(s.type) ? <Tag label={s.accepted ? "موافق" : "مطلوبة"} tone={s.accepted ? "success" : "neutral"} /> : null}
            </View>
            {s.accepted && s.acceptedAtUtc ? <AppText variant="muted">{`الإصدار ${s.acceptedVersion} — ${formatDate(s.acceptedAtUtc)}`}</AppText> : null}
            {isOptionalConsent(s.type) ? (
              <Button
                label={s.accepted ? "سحب الموافقة" : "موافقة"}
                variant="secondary"
                busy={toggle.isPending && toggle.variables?.type === s.type}
                onPress={() => toggle.mutate(s)}
              />
            ) : null}
          </View>
        ))}
        <Button label={showHistory ? "إخفاء سجل الموافقات" : "عرض سجل الموافقات السابقة"} variant="ghost" onPress={() => setShowHistory((v) => !v)} />
        {showHistory && history.data?.length === 0 ? <AppText variant="muted">لا سجل سابق.</AppText> : null}
        {showHistory
          ? history.data?.map((h, i) => (
              <AppText key={i} variant="muted">
                {`${ar.consent[h.type]} — الإصدار ${h.policyVersion} — ${formatDateTime(h.acceptedAtUtc)}${h.revokedAtUtc ? ` (سُحبت ${formatDateTime(h.revokedAtUtc)})` : ""}`}
              </AppText>
            ))
          : null}
      </Card>

      <Card>
        <AppText variant="heading">من اطّلع على بياناتك؟</AppText>
        <AppText variant="muted">سجل شفاف بكل مرة اطّلع فيها مختص أو منسق أو مشرف على ملاحظاتك أو ملف حجزك.</AppText>
        {accessLog.data?.length === 0 ? <AppText>لا أحد اطّلع على بياناتك حتى الآن.</AppText> : null}
        {accessLog.data?.map((e, i) => (
          <View key={i} style={{ paddingVertical: space.xs }}>
            <AppText>{ACCESS_LOG_ACTION_LABELS[e.action] ?? e.action}</AppText>
            <AppText variant="muted">{`${ACCESS_LOG_ROLE_LABELS[e.actorRole] ?? e.actorRole} — ${formatDateTime(e.occurredAtUtc)}`}</AppText>
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="heading">بياناتي</AppText>
        <AppText variant="muted">نسخة من كل بياناتك في سند (JSON) تحفظها أو ترسلها حيث تشاء. لا تبقى نسخة منها داخل التطبيق.</AppText>
        {exporter.error ? <Banner tone="danger">{exporter.error instanceof ApiError ? exporter.error.friendly : "تعذّر التصدير."}</Banner> : null}
        <Button label="تصدير بياناتي" variant="secondary" busy={exporter.isPending} onPress={() => exporter.mutate()} />
      </Card>

      <Card style={{ borderColor: c.danger }}>
        <AppText variant="heading" style={{ color: c.danger }}>
          حذف الحساب
        </AppText>
        <AppText variant="muted">حذف نهائي لبياناتك الشخصية من سند ومن هذا الجهاز.</AppText>
        <Button label="حذف حسابي…" variant="ghost" onPress={() => router.push("/settings/delete")} />
      </Card>
    </Screen>
  );
}
