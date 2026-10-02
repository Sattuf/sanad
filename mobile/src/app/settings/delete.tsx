import { DELETE_CONFIRMATION } from "@sanad/shared/api/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { AppText, Banner, Button, Card, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { wipeLocalData } from "@/lib/accountData";
import { account } from "@/lib/queries";
import { useColors } from "@/theme";

/**
 * حذف الحساب من داخل التطبيق (شرط Apple 5.1.1(v) وGoogle Play): نفس عبارة التأكيد التي يطلبها الخادم،
 * ثم تأكيد أخير. بعد النجاح يُمسح كل ما يخص الحساب من الجهاز.
 */
export default function DeleteAccountScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const remove = useMutation({
    mutationFn: () => account.deleteAccount(confirm.trim()),
    onSuccess: async () => {
      await wipeLocalData(qc);
      router.dismissAll();
      router.replace("/");
      Alert.alert("حُذف حسابك", "حُذفت بياناتك الشخصية. الأوراد والرقية تبقى متاحة لك دون حساب.");
    },
  });

  const ask = () =>
    Alert.alert("حذف الحساب نهائياً؟", "لا يمكن التراجع عن هذه الخطوة.", [
      { text: "تراجع", style: "cancel" },
      { text: "احذف", style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <Screen>
      <Card style={{ borderColor: c.danger }}>
        <AppText variant="heading" style={{ color: c.danger }}>
          حذف الحساب
        </AppText>
        <AppText>
          تُحذف بياناتك الشخصية نهائياً، وتُجرَّد السجلات المرتبطة (حجوزات، توصيات مستلمة) من هويتك دون حذف أثرها الإداري. لا يمكن التراجع.
        </AppText>
        <AppText variant="muted">ويُمسح من هذا الجهاز: جلستك، وتقدّم وردك، وتذكيراتك المجدولة.</AppText>
        <AppText variant="muted">ننصحك بتصدير بياناتك أولاً إن أردت الاحتفاظ بنسخة.</AppText>
      </Card>
      <TextField label={`اكتب «${DELETE_CONFIRMATION}» للتأكيد`} value={confirm} onChangeText={setConfirm} autoCorrect={false} />
      {remove.error ? <Banner tone="danger">{remove.error instanceof ApiError ? remove.error.friendly : "تعذّر الحذف. تحقق من اتصالك."}</Banner> : null}
      <Button label="حذف حسابي نهائياً" busy={remove.isPending} disabled={confirm.trim() !== DELETE_CONFIRMATION} onPress={ask} />
    </Screen>
  );
}
