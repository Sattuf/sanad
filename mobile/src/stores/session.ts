import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/*
  الجلسة على الجوال (ADR-0014، ADR-0018): رمز الوصول في الذاكرة فقط، ورمز التحديث في Keychain/Keystore
  حتى تبقى الجلسة بعد إغلاق التطبيق. WHEN_UNLOCKED_THIS_DEVICE_ONLY: لا يُقرأ والجهاز مقفل، ولا ينتقل مع النسخ الاحتياطي.
*/
const REFRESH_KEY = "sanad.refresh";
const STORE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  /** اكتمل تحميل الرمز المحفوظ — قبلها لا نعرف إن كان المستخدم مسجّلاً. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
}

function persist(value: string | null) {
  const write = value ? SecureStore.setItemAsync(REFRESH_KEY, value, STORE_OPTIONS) : SecureStore.deleteItemAsync(REFRESH_KEY, STORE_OPTIONS);
  // فشل الكتابة لا يكسر الجلسة الحالية — تبقى في الذاكرة حتى إغلاق التطبيق
  write.catch(() => undefined);
}

export const useSession = create<SessionState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    let stored: string | null = null;
    try {
      stored = await SecureStore.getItemAsync(REFRESH_KEY, STORE_OPTIONS);
    } catch {
      stored = null;
    }
    // رمز وصل أثناء التحميل (دخول سريع) أحدث من المحفوظ
    set((s) => ({ hydrated: true, refreshToken: s.refreshToken ?? stored }));
  },
  setTokens: (accessToken, refreshToken) => {
    persist(refreshToken);
    set({ accessToken, refreshToken });
  },
  clear: () => {
    persist(null);
    set({ accessToken: null, refreshToken: null });
  },
}));
