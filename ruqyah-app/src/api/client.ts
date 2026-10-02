import { createApiClient, type SessionPort } from "@sanad/shared/api/core";
import type { EmergencyReferral } from "@sanad/shared/api/types";

/*
  عميل الـ API — النواة المشتركة نفسها التي يستعملها الويب والجوال (ADR-0014، ADR-0018).
  الجلسة كما في الويب: رمز الوصول في الذاكرة فقط، ورمز التحديث في sessionStorage (يُمحى بإغلاق التبويب)، لا localStorage.
  الحساب اختياري تماماً: إن لم يُعدّ عنوان الـ API يعمل التطبيق محلياً كاملاً وتختفي ميزات الحساب.
*/
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
export const WEB_URL: string = (import.meta.env.VITE_SANAD_WEB_URL as string | undefined)?.trim() ?? "";
export const hasApi = API_URL.length > 0;

const REFRESH_KEY = "sanad:refresh";
let accessToken: string | null = null;
const sessionListeners = new Set<() => void>();
const notify = () => sessionListeners.forEach((l) => l());

export const session: SessionPort = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => {
    try {
      return sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setTokens(access, refresh) {
    accessToken = access;
    try {
      sessionStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* تبقى الجلسة في الذاكرة */
    }
    notify();
  },
  clear() {
    accessToken = null;
    try {
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* لا شيء */
    }
    notify();
  },
};

export const onSessionChange = (l: () => void) => {
  sessionListeners.add(l);
  return () => sessionListeners.delete(l);
};

export const isSignedIn = () => Boolean(session.getRefreshToken() || session.getAccessToken());

/** إشارة خطر من أي استجابة: تُعرض فوراً صفحة الطوارئ، بصرف النظر عن نجاح الطلب. */
const emergencyListeners = new Set<(r: EmergencyReferral | null) => void>();
export const onEmergency = (l: (r: EmergencyReferral | null) => void) => {
  emergencyListeners.add(l);
  return () => emergencyListeners.delete(l);
};

export const client = createApiClient({
  baseUrl: API_URL || "http://invalid.localhost",
  session,
  onEmergency: (r) => emergencyListeners.forEach((l) => l(r)),
});

export const api = client.api;
