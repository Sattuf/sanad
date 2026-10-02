import { useState } from "react";
import { Linking, View } from "react-native";
import { Captcha } from "@/components/Captcha";
import { AppText, Banner, Button, Checkbox, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { WEB_BASE_URL } from "@/lib/links";
import { useAuthProviders } from "@/lib/queries";
import { useCompleteSignIn } from "@/lib/useCompleteSignIn";
import { space } from "@/theme";

type Mode = "login" | "register";

export default function EmailScreen() {
  const providers = useAuthProviders();
  const complete = useCompleteSignIn();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteKey = providers.data?.captchaEnabled ? providers.data.captchaSiteKey : null;
  const needsCaptcha = mode === "register" && !!siteKey;
  const canSubmit =
    email.trim().length > 3 && password.length > 0 && (mode === "login" || (displayName.trim() && terms && privacy && (!needsCaptcha || captcha)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await auth.loginEmail(email, password)
          : await auth.registerEmail({ email, password, displayName, acceptTerms: terms, acceptPrivacyPolicy: privacy }, captcha);
      setError(await complete(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "تعذّر الدخول.");
      // رمز CAPTCHA لمرة واحدة
      setCaptcha(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="title">{mode === "login" ? "الدخول بالبريد" : "إنشاء حساب بالبريد"}</AppText>
      {mode === "register" ? (
        <TextField label="الاسم الظاهر" value={displayName} onChangeText={setDisplayName} autoComplete="name" maxLength={100} />
      ) : null}
      <TextField label="البريد الإلكتروني" ltr value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <TextField
        label="كلمة المرور"
        ltr
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        textContentType={mode === "login" ? "password" : "newPassword"}
        hint={mode === "register" ? "10 أحرف على الأقل، فيها حرف لاتيني كبير وصغير ورقم." : undefined}
      />
      {mode === "register" ? (
        <View style={{ gap: space.xs }}>
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
        </View>
      ) : null}
      {needsCaptcha && siteKey ? <Captcha key={captchaKey} siteKey={siteKey} onToken={setCaptcha} /> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button label={mode === "login" ? "دخول" : "إنشاء الحساب"} busy={busy} disabled={!canSubmit} onPress={() => void submit()} />
      <Button
        label={mode === "login" ? "ليس لديك حساب؟ أنشئ حساباً" : "لديك حساب؟ ادخل"}
        variant="ghost"
        onPress={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
      />
    </Screen>
  );
}
