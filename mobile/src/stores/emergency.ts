import type { EmergencyReferral } from "@sanad/shared/api/types";
import { FALLBACK_REFERRAL } from "@sanad/shared/safety/emergency";
import { create } from "zustand";

/*
  مسار الإحالة العاجلة: أي استجابة تحمل إشارة خطر ترفع هذا العلم، فيظهر شريط الطوارئ فوق كل شاشة —
  بصرف النظر عن نجاح العملية الأصلية أو فشلها. الكشف نفسه في packages/shared (مطابق للويب).
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
