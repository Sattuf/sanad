import { createApiClient } from "@sanad/shared/api/core";
import { useEmergency } from "@/stores/emergency";
import { useSession } from "@/stores/session";

export { ApiError } from "@sanad/shared/api/core";

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:5080";

// نفس نواة عميل الويب (packages/shared/api/core.ts) — هنا فقط ربطها بجلسة الجوال وشريط الطوارئ
const client = createApiClient({
  baseUrl: API_BASE,
  session: {
    getAccessToken: () => useSession.getState().accessToken,
    getRefreshToken: () => useSession.getState().refreshToken,
    setTokens: (access, refresh) => useSession.getState().setTokens(access, refresh),
    clear: () => useSession.getState().clear(),
  },
  onEmergency: (referral) => useEmergency.getState().raise(referral),
});

export const { api, request, mediaUrl } = client;
