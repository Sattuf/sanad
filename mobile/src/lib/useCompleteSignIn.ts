import { needsConsent } from "@sanad/shared/api/account";
import type { AuthResponse } from "@sanad/shared/api/types";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback } from "react";
import { finishSignIn } from "@/lib/auth";
import { account, queryKeys } from "@/lib/queries";

export const WEB_ONLY_MESSAGE = "هذا الحساب إداري ويحتاج إكمال إعداد الأمان على موقع سند. تطبيق الجوال مخصص للمستفيدين.";

/**
 * بعد أي طريقة دخول: يحفظ الجلسة ثم يوجّه — رمز 2FA ← شاشته، حساب جديد بلا موافقات ← شاشة الموافقات، وإلا ← «حسابي».
 * يعيد رسالة خطأ للعرض أو null. استجابة null تعني أن المستخدم ألغى (جوجل/أبل) فلا شيء يُعرض.
 */
export function useCompleteSignIn() {
  const qc = useQueryClient();
  return useCallback(
    async (res: AuthResponse | null): Promise<string | null> => {
      if (!res) return null;
      const outcome = finishSignIn(res);
      if (outcome.kind === "two-factor") {
        router.push({ pathname: "/auth/two-factor", params: { ticket: outcome.ticket } });
        return null;
      }
      if (outcome.kind === "web-only") return WEB_ONLY_MESSAGE;

      const me = await qc.fetchQuery({ queryKey: queryKeys.me, queryFn: account.me, staleTime: 0 });
      if (router.canDismiss()) router.dismissAll();
      router.replace(needsConsent(me) ? "/auth/consent" : "/account");
      return null;
    },
    [qc],
  );
}
