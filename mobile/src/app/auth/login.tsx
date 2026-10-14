import Ionicons from "@expo/vector-icons/Ionicons";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, useColorScheme, View } from "react-native";
import { AppText, Banner, Button, Screen } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { appleAvailable, googleConfigured, signInWithApple, signInWithGoogle } from "@/lib/auth";
import { useAuthProviders } from "@/lib/queries";
import { useCompleteSignIn } from "@/lib/useCompleteSignIn";
import { space, useColors } from "@/theme";

/**
 * اختيار طريقة الدخول (references/10 §10.4): طرق متكافئة، بلا أي مستند — الحساب يُنشأ فوراً بدور مستفيد.
 * على iPhone لا يظهر جوجل إلا ومعه «الدخول بأبل» (إرشاد Apple 4.8).
 */
export default function LoginScreen() {
  const c = useColors();
  const scheme = useColorScheme();
  const providers = useAuthProviders();
  const complete = useCompleteSignIn();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);

  const showApple = apple && !!providers.data?.apple;
  const showGoogle = !!providers.data?.googleNative && googleConfigured() && (Platform.OS !== "ios" || showApple);

  const run = async (method: "google" | "apple", signIn: () => Promise<Parameters<typeof complete>[0]>) => {
    setBusy(method);
    setError(null);
    try {
      setError(await complete(await signIn()));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "تعذّر إكمال الدخول. حاول مجدداً أو اختر طريقة أخرى.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <AppText variant="title">أهلاً بك في سند</AppText>
      <AppText variant="muted">اختر طريقة الدخول. لا نطلب أي مستند — الحساب يُنشأ فوراً، وسند مجانية بالكامل.</AppText>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <View style={{ gap: space.md, marginTop: space.md }}>
        {showApple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={scheme === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 52, opacity: busy ? 0.5 : 1 }}
            onPress={() => !busy && void run("apple", signInWithApple)}
          />
        ) : null}
        {showGoogle ? (
          <Button
            label="المتابعة بحساب جوجل"
            variant="secondary"
            busy={busy === "google"}
            disabled={!!busy}
            icon={<Ionicons name="logo-google" size={20} color={c.primary} />}
            onPress={() => void run("google", signInWithGoogle)}
          />
        ) : null}
        <Button
          label="البريد الإلكتروني"
          variant="secondary"
          disabled={!!busy}
          icon={<Ionicons name="mail-outline" size={20} color={c.primary} />}
          onPress={() => router.push("/auth/email")}
        />
        <Button
          label="رقم الهاتف (رمز تحقق)"
          variant="secondary"
          disabled={!!busy}
          icon={<Ionicons name="call-outline" size={20} color={c.primary} />}
          onPress={() => router.push("/auth/phone")}
        />
      </View>
      <AppText variant="muted" style={{ marginTop: space.lg }}>
        بالمتابعة توافق على شروط الاستخدام وسياسة الخصوصية، وتُعرض عليك للموافقة الصريحة عند إنشاء الحساب.
      </AppText>
    </Screen>
  );
}
