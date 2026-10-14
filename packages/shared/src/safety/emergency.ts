import type { EmergencyReferral } from "../api/types";

/*
  مسار الإحالة العاجلة — مشترك بين الويب والجوال حتى لا ينحرف أحدهما عن الآخر:
  أي استجابة تحمل الترويسة X-Sanad-Emergency-Referral أو الحقل emergencyReferral.required ترفع شريط الطوارئ فوراً،
  بصرف النظر عن نجاح العملية الأصلية أو فشلها.
*/
export const EMERGENCY_HEADER = "X-Sanad-Emergency-Referral";

export const FALLBACK_REFERRAL: EmergencyReferral = {
  required: true,
  message: "إن كنت أنت أو أي شخص في خطر مباشر الآن، اتصل بالطوارئ فوراً. سند ليست خدمة طوارئ ولا تتابع الرسائل لحظياً.",
  contacts: [{ label: "رقم الطوارئ الدولي من الجوال", phoneNumber: "112" }],
  emergencyPagePath: "/emergency",
};

/** هل تحمل الاستجابة إشارة خطر؟ يعيد معلومات الإحالة (أو null إن لم يرسل الخادم تفاصيل) أو undefined إن لا إشارة. */
export function detectEmergency(headerValue: string | null, payload: unknown): EmergencyReferral | null | undefined {
  const body = payload as { emergencyReferral?: EmergencyReferral | null } | null;
  if (headerValue === "1" || body?.emergencyReferral?.required) return body?.emergencyReferral ?? null;
  return undefined;
}
