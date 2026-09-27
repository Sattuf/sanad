import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "../api/hooks";
import type { Role } from "../api/types";
import { Loading } from "../components/ui";
import { useSession } from "../stores/session";

/** يتطلب جلسة، ويفرض قبول الشروط والخصوصية قبل أي شاشة مصادَقة. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const hasSession = useSession((s) => Boolean(s.accessToken || s.refreshToken));
  const location = useLocation();
  const { data, isLoading, isError } = useMe();

  if (!hasSession || isError) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (isLoading || !data) return <Loading />;

  const needsConsent = !data.activeConsents.includes("TermsOfService") || !data.activeConsents.includes("PrivacyPolicy");
  if (needsConsent && location.pathname !== "/onboarding/consent") return <Navigate to="/onboarding/consent" replace />;
  return <>{children}</>;
}

/**
 * حارس الدور — طبقة عرض فقط. الحماية الفعلية على الخادم (Policy + فحص الملكية)؛
 * هذا يمنع فقط ظهور شاشات لا تخص المستخدم (مثل: المستفيد لا يرى CaseNoteEditor أبداً، حتى بالرابط المباشر).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data } = useMe();
  if (!data) return <Loading />;
  if (!roles.some((r) => data.roles.includes(r))) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
