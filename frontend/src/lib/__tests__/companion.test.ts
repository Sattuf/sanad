import { describe, expect, it } from "vitest";
import { currentDay, dayProgress } from "../../stores/companion";
import { PROGRAMS } from "../../content/programs";
import { addDays, daysBetween } from "../dates";
import { normalizeArabic } from "../arabic";
import { requiresEmergencyReferral } from "../riskSignals";

describe("التقدّم والتواريخ", () => {
  it("اليوم الحالي يتبع التقويم ولا يتجاوز طول البرنامج", () => {
    expect(currentDay("2026-10-01", 7, "2026-10-01")).toBe(1);
    expect(currentDay("2026-10-01", 7, "2026-10-03")).toBe(3);
    expect(currentDay("2026-10-01", 7, "2026-11-30")).toBe(7);
    expect(daysBetween("2026-10-30", addDays("2026-10-30", 5))).toBe(5);
  });

  it("نسبة إنجاز اليوم", () => {
    const p = PROGRAMS[0];
    const d = p.plan[0];
    const done = { [`${p.id}:1:${d.tasks[0].id}`]: true as const };
    expect(dayProgress(p.id, d, done).completed).toBe(1);
  });
});

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
