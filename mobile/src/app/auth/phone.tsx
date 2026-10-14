import { COUNTRY_CODES, DEFAULT_COUNTRY_ISO2, isE164, toE164 } from "@sanad/shared/lib/countryCodes";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Captcha } from "@/components/Captcha";
import { CountryPicker } from "@/components/CountryPicker";
import { AppText, Banner, Button, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useAuthProviders } from "@/lib/queries";
import { useCompleteSignIn } from "@/lib/useCompleteSignIn";
import { space } from "@/theme";

const RESEND_SECONDS = 60;

/** الدخول برقم الهاتف: الرقم ← رمز من 6 أرقام. CAPTCHA قبل الإرسال (استنزاف رصيد SMS تهديد تكلفة حقيقي). */
export default function PhoneScreen() {
  const providers = useAuthProviders();
  const complete = useCompleteSignIn();
  const [country, setCountry] = useState(COUNTRY_CODES.find((c) => c.iso2 === DEFAULT_COUNTRY_ISO2)!);
  const [national, setNational] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phone = toE164(country.dialCode, national);
  const siteKey = providers.data?.captchaEnabled ? providers.data.captchaSiteKey : null;

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "تعذّر إكمال الطلب.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    attempt(async () => {
      try {
        await auth.requestOtp(phone, captcha);
        setSentTo(phone);
        setCode("");
        setCooldown(RESEND_SECONDS);
      } finally {
        setCaptcha(null);
        setCaptchaKey((k) => k + 1);
      }
    });

  const verify = () => attempt(async () => setError(await complete(await auth.verifyOtp(sentTo!, code, email))));

  if (!sentTo) {
    return (
      <Screen>
        <AppText variant="title">الدخول برقم الهاتف</AppText>
        <AppText variant="muted">نرسل لك رمز تحقق برسالة نصية. إن لم يكن لديك حساب نُنشئه لك.</AppText>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <TextField label="رقم الجوال" ltr value={national} onChangeText={setNational} keyboardType="phone-pad" autoComplete="tel" placeholder="5XXXXXXXX" />
          </View>
          <CountryPicker value={country} onChange={setCountry} />
        </View>
        {siteKey ? <Captcha key={captchaKey} siteKey={siteKey} onToken={setCaptcha} /> : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button label="أرسل الرمز" busy={busy} disabled={!isE164(phone) || (!!siteKey && !captcha)} onPress={() => void send()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title">أدخل رمز التحقق</AppText>
      <AppText variant="muted">{`أرسلنا رمزاً من 6 أرقام إلى ‎${sentTo}`}</AppText>
      <TextField label="الرمز" ltr value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
      <TextField label="البريد الإلكتروني (اختياري)" ltr value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" hint="يفيد في استرجاع الحساب وتصدير بياناتك." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button label="تحقق ودخول" busy={busy} disabled={code.length !== 6} onPress={() => void verify()} />
      {cooldown > 0 ? (
        <AppText variant="muted">{`يمكنك طلب رمز جديد بعد ${cooldown} ثانية`}</AppText>
      ) : (
        <Button label="غيّر الرقم أو اطلب رمزاً جديداً" variant="ghost" onPress={() => setSentTo(null)} />
      )}
    </Screen>
  );
}
