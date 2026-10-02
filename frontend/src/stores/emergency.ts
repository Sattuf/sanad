import { create } from "zustand";
import type { EmergencyReferral } from "@sanad/shared/api/types";
import { FALLBACK_REFERRAL } from "@sanad/shared/safety/emergency";

export { FALLBACK_REFERRAL };

/*
  مسار الإحالة العاجلة على العميل: أي استجابة تحمل الترويسة X-Sanad-Emergency-Referral أو الحقل emergencyReferral
  ترفع هذا العلم فوراً، فيظهر شريط الطوارئ فوق كل شاشة — بصرف النظر عن نجاح العملية الأصلية أو فشلها.
*/
interface EmergencyState {
  referral: EmergencyReferral | null;
  raise: (referral: EmergencyReferral | null) => void;
  dismiss: () => void;
}

export const useEmergency = create<EmergencyState>((set) => ({
  referral: null,
  raise: (referral) => set({ referral: referral ?? FALLBACK_REFERRAL }),
  dismiss: () => set({ referral: null }),
}));
