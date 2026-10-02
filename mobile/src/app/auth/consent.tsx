import type { ConsentType } from "@sanad/shared/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";
import { AppText, Banner, Button, Card, Checkbox, Screen } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { WEB_BASE_URL } from "@/lib/links";
import { account, queryKeys } from "@/lib/queries";

/** موافقات أول دخول — من دخل بجوجل أو أبل أو الهاتف لم يمر بنموذج تسجيل (مطابق للويب). */
export default function ConsentScreen() {
  const qc = useQueryClient();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const types: ConsentType[] = ["TermsOfService", "PrivacyPolicy", ...(marketing ? (["MarketingCommunication"] as const) : [])];
      for (const type of types) await account.recordConsent(type);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      router.replace("/account");
    },
  });

  return (
    <Screen>
      <AppText variant="title">قبل أن نبدأ</AppText>
      <AppText variant="muted">موافقات أساسية لاستخدام سند. يمكنك مراجعتها وسحب الاختيارية منها لاحقاً من «حسابي».</AppText>
      <Card>
        <Checkbox checked={terms} onChange={setTerms}>
          <AppText>
            أوافق على{" "}
            <AppText style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(`${WEB_BASE_URL}/terms`)}>
              شروط الاستخدام
            </AppText>
          </AppText>
        </Checkbox>
        <Checkbox checked={privacy} onChange={setPrivacy}>
          <AppText>
            أوافق على{" "}
            <AppText style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(`${WEB_BASE_URL}/privacy`)}>
              سياسة الخصوصية
            </AppText>
          </AppText>
        </Checkbox>
        <Checkbox checked={marketing} onChange={setMarketing}>
          (اختياري) أرغب بتذكير يومي لطيف: دعاء أو آية اليوم
        </Checkbox>
      </Card>
      {save.error ? <Banner tone="danger">{save.error instanceof ApiError ? save.error.friendly : "تعذّر الحفظ"}</Banner> : null}
      <Button label="متابعة" busy={save.isPending} disabled={!terms || !privacy} onPress={() => save.mutate()} />
      <Button
        label="لا أوافق — تسجيل الخروج"
        variant="ghost"
        onPress={async () => {
          await signOut();
          qc.clear();
          router.replace("/");
        }}
      />
    </Screen>
  );
}
