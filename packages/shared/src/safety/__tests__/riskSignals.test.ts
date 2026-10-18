import { describe, expect, it } from "vitest";
import { normalizeArabic } from "../../lib/arabic";
import { requiresEmergencyReferral } from "../riskSignals";

describe("التوحيد ومؤشرات الخطر", () => {
  it("يوحّد التشكيل والهمزات والتاء المربوطة", () => {
    expect(normalizeArabic("الطّاقةُ السلبيّة")).toBe("الطاقه السلبيه");
    expect(normalizeArabic("أإآ")).toBe("ااا");
  });

  it("يلتقط مؤشرات الخطر في المذكرة المحلية (البند 5) ولا يلتقط الكلام العادي", () => {
    expect(requiresEmergencyReferral("صرت أفكر إني أبي أموت")).toBe(true);
    expect(requiresEmergencyReferral("فقدتُ الأمل في الحياة")).toBe(true);
    expect(requiresEmergencyReferral("I want to die")).toBe(true);
    expect(requiresEmergencyReferral("نمت جيداً والحمد لله")).toBe(false);
  });
});
