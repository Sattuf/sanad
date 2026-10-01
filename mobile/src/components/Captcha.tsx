import { useMemo } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useColors } from "@/theme";
import { AppText } from "./ui";

/*
  CAPTCHA على الجوال (ADR-0011، ADR-0019): ودجت Cloudflare Turnstile داخل WebView صغير يعيد الرمز للتطبيق.
  Turnstile يتحقق من نطاق الصفحة، فتُحمَّل بعنوان أساس من نطاق سند المسجّل في لوحة Turnstile (EXPO_PUBLIC_CAPTCHA_ORIGIN).
  الرمز لمرة واحدة: بعد كل طلب يُعاد تحميل الودجت بتغيير key من الشاشة.
*/
const ORIGIN = process.env.EXPO_PUBLIC_CAPTCHA_ORIGIN ?? "https://sanad.app";

export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const c = useColors();
  const html = useMemo(
    () => `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style></head><body>
<div class="cf-turnstile" data-sitekey="${siteKey.replace(/[^\w-]/g, "")}" data-language="ar" data-callback="ok" data-expired-callback="gone" data-error-callback="gone"></div>
<script>
function post(v){window.ReactNativeWebView.postMessage(JSON.stringify({token:v}))}
function ok(t){post(t)} function gone(){post(null)}
</script></body></html>`,
    [siteKey],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const { token } = JSON.parse(e.nativeEvent.data) as { token: string | null };
      onToken(typeof token === "string" && token.length < 4096 ? token : null);
    } catch {
      onToken(null);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 70, borderRadius: 12, overflow: "hidden" }}>
        <WebView
          source={{ html, baseUrl: ORIGIN }}
          onMessage={onMessage}
          originWhitelist={[ORIGIN, "https://challenges.cloudflare.com"]}
          // الصفحة لا تفتح أي رابط خارجي ولا نوافذ
          setSupportMultipleWindows={false}
          style={{ backgroundColor: "transparent" }}
          scrollEnabled={false}
        />
      </View>
      <AppText variant="muted" style={{ color: c.muted }}>
        تحقق سريع أنك لست برنامجاً آلياً.
      </AppText>
    </View>
  );
}
