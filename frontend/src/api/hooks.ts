import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "../stores/session";
import { api } from "./client";
import type { AuthResponse, MyProfile, Role } from "./types";

export const queryKeys = {
  me: ["me"] as const,
};

/** الملف الشخصي للمستخدم الحالي — مفعّل فقط عند وجود جلسة. */
export function useMe() {
  const hasSession = useSession((s) => Boolean(s.accessToken || s.refreshToken));
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<MyProfile>("/api/v1/me"),
    enabled: hasSession,
    staleTime: 60_000,
    retry: false,
  });
}

export function useHasRole(...roles: Role[]) {
  const { data } = useMe();
  return Boolean(data && roles.some((r) => data.roles.includes(r)));
}

/** يحفظ الرموز بعد نجاح أي طريقة دخول، ويعيد تحميل الملف الشخصي. */
export function useCompleteSignIn() {
  const setTokens = useSession((s) => s.setTokens);
  const qc = useQueryClient();
  return useCallback(
    async (res: AuthResponse) => {
      if (res.stage !== "Succeeded" || !res.accessToken || !res.refreshToken) return false;
      setTokens(res.accessToken, res.refreshToken);
      await qc.invalidateQueries();
      return true;
    },
    [setTokens, qc],
  );
}

export function useSignOut() {
  const qc = useQueryClient();
  const clear = useSession((s) => s.clear);
  return useCallback(async () => {
    const refreshToken = useSession.getState().refreshToken;
    try {
      await api.post("/api/v1/auth/revoke", { refreshToken });
    } catch {
      /* الإبطال من الخادم أفضل جهد — الجلسة المحلية تُمحى في كل الأحوال */
    }
    clear();
    qc.clear();
  }, [clear, qc]);
}

export const STAFF_ROLES: Role[] = ["Coordinator", "ContentManager", "SystemAdmin", "ClinicalSupervisor", "PrivacySecurityOfficer"];
