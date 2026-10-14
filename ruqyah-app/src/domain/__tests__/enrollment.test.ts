import { describe, expect, it } from "vitest";
import { findPlan } from "../../content/plans";
import { completeDay, currentDay, doneToday, enroll, isFinished, isResuming } from "../enrollment";

const plan = findPlan("morning-evening-7")!;
const at = (s: string) => new Date(`${s}T09:00:00`);

describe("التسجيل في الخطة", () => {
  it("يبدأ من اليوم الأول ويتقدّم يوماً بعد يوم", () => {
    let e = enroll(plan, at("2026-10-01"));
    expect(currentDay(e, plan)).toBe(1);
    e = completeDay(e, plan, at("2026-10-01"));
    expect(e.completedDays).toEqual([1]);
    expect(currentDay(e, plan)).toBe(2);
    expect(doneToday(e, at("2026-10-01"))).toBe(true);
    expect(doneToday(e, at("2026-10-02"))).toBe(false);
  });

  it("لا يتجاوز مدة الخطة", () => {
    let e = enroll(plan, at("2026-10-01"));
    for (let i = 0; i < 10; i++) e = completeDay(e, plan, at("2026-10-01"));
    expect(e.completedDays).toHaveLength(7);
    expect(isFinished(e, plan)).toBe(true);
  });

  it("الانقطاع يُعرف ولا يُحسب عليه شيء", () => {
    let e = enroll(plan, at("2026-10-01"));
    e = completeDay(e, plan, at("2026-10-01"));
    expect(isResuming(e, at("2026-10-02"))).toBe(false);
    expect(isResuming(e, at("2026-10-05"))).toBe(true);
    // بعد الانقطاع يكمل من اليوم التالي في الخطة، لا من اليوم التقويمي
    expect(currentDay(e, plan)).toBe(2);
  });

  it("لا يحتوي التسجيل أي حقل عن حال المستخدم", () => {
    const e = enroll(plan);
    expect(Object.keys(e).sort()).toEqual(["completedDays", "planId", "planVersion", "reminder", "startedAt"]);
  });
});
