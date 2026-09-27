import { create } from "zustand";
import type { EmergencyReferral } from "../api/types";

/*
  مسار الإحالة العاجلة على العميل: أي استجابة تحمل الترويسة X-Sanad-Emergency-Referral أو الحقل emergencyReferral
  ترفع هذا العلم فوراً، فيظهر شريط الطوارئ فوق كل شاشة — بصرف النظر عن نجاح العملية الأصلية أو فشلها.
*/
interface EmergencyState {
  referral: EmergencyReferral | null;
  raise: (referral: EmergencyReferral | null) => void;
  dismiss: () => void;
}

export const FALLBACK_REFERRAL: EmergencyReferral = {
  required: true,
  message: "إن كنت أنت أو أي شخص في خطر مباشر الآن، اتصل بالطوارئ فوراً. سند ليست خدمة طوارئ ولا تتابع الرسائل لحظياً.",
  contacts: [{ label: "رقم الطوارئ الدولي من الجوال", phoneNumber: "112" }],
  emergencyPagePath: "/emergency",
};

export const useEmergency = create<EmergencyState>((set) => ({
  referral: null,
  raise: (referral) => set({ referral: referral ?? FALLBACK_REFERRAL }),
  dismiss: () => set({ referral: null }),
}));
