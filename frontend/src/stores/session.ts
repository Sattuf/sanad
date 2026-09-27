import { create } from "zustand";

/*
  الجلسة: رمز الوصول في الذاكرة فقط، ورمز التحديث في sessionStorage (يُمحى بإغلاق التبويب).
  لا شيء من هذا في localStorage — راجع docs/adr/0014.
*/
const REFRESH_KEY = "sanad.refresh";

function readRefresh(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(value: string | null) {
  try {
    if (value) sessionStorage.setItem(REFRESH_KEY, value);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    /* تخزين غير متاح — الجلسة تبقى في الذاكرة فقط */
  }
}

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: readRefresh(),
  setTokens: (accessToken, refreshToken) => {
    writeRefresh(refreshToken);
    set({ accessToken, refreshToken });
  },
  clear: () => {
    writeRefresh(null);
    set({ accessToken: null, refreshToken: null });
  },
}));
