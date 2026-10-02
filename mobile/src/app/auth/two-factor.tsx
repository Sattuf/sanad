import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { AppText, Banner, Button, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useCompleteSignIn } from "@/lib/useCompleteSignIn";

/** رمز تطبيق المصادقة لمن فعّل التحقق الثنائي. التذكرة قصيرة الأجل — إن انتهت يعود المستخدم للبداية. */
export default function TwoFactorScreen() {
  const { ticket } = useLocalSearchParams<{ ticket: string }>();
  const complete = useCompleteSignIn();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setError(await complete(await auth.verifyTwoFactor(ticket, code)));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "تعذّر التحقق.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="title">التحقق الثنائي</AppText>
      <AppText variant="muted">أدخل الرمز من 6 أرقام الظاهر في تطبيق المصادقة.</AppText>
      <TextField label="الرمز" ltr value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" autoFocus />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button label="تحقق" busy={busy} disabled={code.length !== 6} onPress={() => void submit()} />
      <Button label="البدء من جديد" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
