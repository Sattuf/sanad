import { needsConsent } from "@sanad/shared/api/account";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { AppText, Banner, Button, Card, RowLink, Screen } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { useMe, useSignedIn } from "@/lib/queries";
import { useColors } from "@/theme";

export default function AccountScreen() {
  const signedIn = useSignedIn();
  return signedIn ? <SignedIn /> : <SignedOut />;
}

function SignedOut() {
  return (
    <Screen>
      <AppText variant="title">حسابي</AppText>
      <Card>
        <AppText>ادخل لتحجز مع مختص موثّق، وتحفظ مفضلتك، ويتزامن وردك بين أجهزتك.</AppText>
        <AppText variant="muted">الأوراد والرقية متاحة لك دائماً دون حساب.</AppText>
      </Card>
      <Button label="الدخول أو إنشاء حساب" onPress={() => router.push("/auth/login")} />
    </Screen>
  );
}

function SignedIn() {
  const c = useColors();
  const qc = useQueryClient();
  const me = useMe();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await signOut();
    // لا تبقى أي بيانات للحساب السابق في ذاكرة التطبيق
    qc.clear();
    setLeaving(false);
  };

  if (me.isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;

  return (
    <Screen>
      <AppText variant="title">{me.data?.displayName ?? "حسابي"}</AppText>
      {me.isError ? <Banner tone="danger">تعذّر تحميل بيانات حسابك. تحقق من اتصالك.</Banner> : null}
      {me.data && needsConsent(me.data) ? (
        <Card>
          <AppText>أكمل الموافقات الأساسية لاستخدام خدمات الحساب.</AppText>
          <Button label="مراجعة الموافقات" onPress={() => router.push("/auth/consent")} />
        </Card>
      ) : null}
      {me.data ? (
        <Card>
          {me.data.email ? <AppText>{`البريد: ${me.data.email}`}</AppText> : null}
          {me.data.phoneNumber ? <AppText>{`الهاتف: ‎${me.data.phoneNumber}`}</AppText> : null}
        </Card>
      ) : null}
      <RowLink title="حجوزاتي" subtitle="طلباتك ومواعيدك مع المختصين" onPress={() => router.push("/bookings")} />
      <Card>
        <AppText variant="muted">الخصوصية، وتصدير بياناتك، وحذف الحساب — تصل إلى التطبيق قريباً، وهي متاحة الآن على موقع سند.</AppText>
      </Card>
      <Button label="تسجيل الخروج" variant="secondary" busy={leaving} onPress={() => void logout()} />
    </Screen>
  );
}
