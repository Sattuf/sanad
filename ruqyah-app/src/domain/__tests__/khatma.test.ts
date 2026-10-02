import { describe, expect, it } from "vitest";
import { dailyPace, daysAtPace, doneCount, isComplete, newSoloKhatma, toggleJuz } from "../khatma";

describe("الختمة الفردية", () => {
  it("ثلاثون جزءاً كلها للمستخدم", () => {
    const k = newSoloKhatma();
    expect(k.juz).toHaveLength(30);
    expect(doneCount(k)).toBe(0);
  });

  it("النقر يسجّل الجزء والنقر الثاني يلغيه", () => {
    let k = toggleJuz(newSoloKhatma(), 5);
    expect(doneCount(k)).toBe(1);
    k = toggleJuz(k, 5);
    expect(doneCount(k)).toBe(0);
  });

  it("تكتمل بقراءة الأجزاء كلها", () => {
    let k = newSoloKhatma();
    for (let i = 1; i <= 30; i++) k = toggleJuz(k, i);
    expect(isComplete(k)).toBe(true);
    expect(k.completedAt).toBeDefined();
    k = toggleJuz(k, 30);
    expect(k.completedAt).toBeUndefined();
  });

  it("الوتيرة نحو التاريخ المستهدف", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const k = { ...newSoloKhatma(now), targetDate: "2026-10-21T00:00:00Z" };
    expect(dailyPace(k, now)).toBe(1.5);
    expect(daysAtPace(k)).toBe(20);
  });
});
