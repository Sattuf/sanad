import type { MyProfile } from "./types";

/** العبارة التي يطلبها الخادم حرفياً لتأكيد الحذف (DeleteMyAccountCommand.ConfirmationPhrase). */
export const DELETE_CONFIRMATION = "احذف حسابي";

export const ACCESS_LOG_ACTION_LABELS: Record<string, string> = {
  "Scheduling.BeneficiaryNoteRead": "اطّلع على ملاحظتك للمختص المرفقة بحجز",
  "PatientCare.CaseNoteSupervisoryRead": "مراجعة إشرافية لملف حجزك",
};
export const ACCESS_LOG_ROLE_LABELS: Record<string, string> = {
  AssignedProvider: "المختص المكلّف",
  CoordinatorEscalation: "منسق (تصعيد موثّق)",
};

/** الشروط والخصوصية إلزاميتان قبل أي شاشة مصادَقة (من يدخل بجوجل/أبل/الهاتف لم يمر بنموذج تسجيل). */
export const needsConsent = (me: Pick<MyProfile, "activeConsents">) =>
  !me.activeConsents.includes("TermsOfService") || !me.activeConsents.includes("PrivacyPolicy");
