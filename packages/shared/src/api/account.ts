import type { ApiClient } from "./core";
import type { ConsentType, MyProfile } from "./types";

/** حساب المستخدم الحالي — مشترك بين الويب والجوال. */
export function accountApi(api: ApiClient["api"]) {
  return {
    me: () => api.get<MyProfile>("/api/v1/me"),
    recordConsent: (type: ConsentType) => api.post<void>("/api/v1/me/consent", { type }),
  };
}

/** الشروط والخصوصية إلزاميتان قبل أي شاشة مصادَقة (من يدخل بجوجل/أبل/الهاتف لم يمر بنموذج تسجيل). */
export const needsConsent = (me: Pick<MyProfile, "activeConsents">) =>
  !me.activeConsents.includes("TermsOfService") || !me.activeConsents.includes("PrivacyPolicy");
