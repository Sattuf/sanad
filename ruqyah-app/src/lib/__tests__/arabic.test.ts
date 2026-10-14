import { describe, expect, it } from "vitest";
import { ajza, ar, days, hijri, minutes } from "../arabic";

describe("الأرقام وصيغ العدد", () => {
  it("تُكتب الأرقام بالمشرقية", () => {
    expect(ar(40)).toBe("٤٠");
  });

  it("صيغة الأيام", () => {
    expect(days(1)).toBe("يوم واحد");
    expect(days(2)).toBe("يومان");
    expect(days(7)).toBe("٧ أيام");
    expect(days(14)).toBe("١٤ يوماً");
  });

  it("صيغة الأجزاء والدقائق", () => {
    expect(ajza(30)).toBe("٣٠ جزءاً");
    expect(ajza(3)).toBe("٣ أجزاء");
    expect(minutes(8)).toBe("٨ دقائق");
    expect(minutes(12)).toBe("١٢ دقيقة");
  });

  it("التاريخ الهجري لا يرمي استثناء", () => {
    expect(hijri(new Date("2026-10-02T08:00:00Z")).length).toBeGreaterThan(0);
  });
});
