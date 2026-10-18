import { describe, expect, it } from "vitest";
import { currentDay, dayProgress } from "../../stores/companion";
import { PROGRAMS } from "../../content/programs";
import { addDays, daysBetween } from "../dates";

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
