import type { ApiClient } from "./core";
import type { AccessLogEntry, ConsentHistoryItem, ConsentStatus, ConsentType, MyProfile } from "./types";

/** حساب المستخدم الحالي — مشترك بين الويب والجوال. */
export function accountApi(api: ApiClient["api"]) {
  return {
    me: () => api.get<MyProfile>("/api/v1/me"),
    rename: (displayName: string) => api.patch<void>("/api/v1/me", { displayName: displayName.trim() }),
    savePrivacy: (body: PrivacyPreferences) => api.patch<void>("/api/v1/me/privacy-preferences", body),
    consents: () => api.get<ConsentStatus[]>("/api/v1/me/consent"),
    consentHistory: () => api.get<ConsentHistoryItem[]>("/api/v1/me/consent/history"),
    recordConsent: (type: ConsentType) => api.post<void>("/api/v1/me/consent", { type }),
    revokeConsent: (type: ConsentType) => api.del<void>(`/api/v1/me/consent/${type}`),
    accessLog: () => api.get<AccessLogEntry[]>("/api/v1/me/access-log"),
    exportData: () => api.post<unknown>("/api/v1/me/export"),
    /** حذف نهائي: البيانات الشخصية تُحذف، والسجلات المرتبطة تُجرَّد من الهوية (ADR-0005). */
    deleteAccount: (confirmation: string) => api.del<void>("/api/v1/me", { confirmation }),
  };
}

export interface PrivacyPreferences { hideIdentityUntilBookingConfirmed: boolean; quietHoursStartHourUtc: number | null; quietHoursEndHourUtc: number | null }

/** العبارة التي يطلبها الخادم حرفياً لتأكيد الحذف (DeleteMyAccountCommand.ConfirmationPhrase). */
export const DELETE_CONFIRMATION = "احذف حسابي";

/** الشروط والخصوصية لا تُسحب من الحساب (سحبها = حذف الحساب)؛ الباقي اختياري. */
export const isOptionalConsent = (type: ConsentType) => type === "MarketingCommunication" || type === "SensitiveDataProcessing";

export const ACCESS_LOG_ACTION_LABELS: Record<string, string> = {
  "Scheduling.BeneficiaryNoteRead": "اطّلع على ملاحظتك للمختص المرفقة بحجز",
  "PatientCare.CaseNoteSupervisoryRead": "مراجعة إشرافية لملف حجزك",
};
export const ACCESS_LOG_ROLE_LABELS: Record<string, string> = {
  AssignedProvider: "المختص المعالج",
  CoordinatorEscalation: "منسق (تصعيد موثّق)",
  ClinicalSupervisor: "مشرف سريري",
};

/** الشروط والخصوصية إلزاميتان قبل أي شاشة مصادَقة (من يدخل بجوجل/أبل/الهاتف لم يمر بنموذج تسجيل). */
export const needsConsent = (me: Pick<MyProfile, "activeConsents">) =>
  !me.activeConsents.includes("TermsOfService") || !me.activeConsents.includes("PrivacyPolicy");
