import { createApiClient } from "@sanad/shared/api/core";
import { useSession } from "../stores/session";

export { ApiError, type RequestOptions } from "@sanad/shared/api/core";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5080";

// النواة مشتركة مع تطبيق الجوال (packages/shared)؛ هنا فقط ربطها بمخزن الجلسة في الويب
const client = createApiClient({
  baseUrl: API_BASE,
  session: {
    getAccessToken: () => useSession.getState().accessToken,
    getRefreshToken: () => useSession.getState().refreshToken,
    setTokens: (access, refresh) => useSession.getState().setTokens(access, refresh),
    clear: () => useSession.getState().clear(),
  },
});

export const { api, mediaUrl } = client;

/** مفتاح تكرار آمن لكل محاولة إرسال نموذج (يبقى ثابتاً عند إعادة المحاولة من نفس النموذج). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** جلب ملف محمي كرابط Blob مؤقت (لتصدير البيانات مثلاً). */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
