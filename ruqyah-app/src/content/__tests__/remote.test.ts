import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quran } from "@sanad/shared/content/quran";
import { findPlan, fromServerPlan, listPlans, planAuthor, setRemotePlans, bundledPlans } from "../plans";

const server = (quranKey = "kursi") => ({
  id: "11111111-1111-1111-1111-111111111111", title: "تحصين الصباح والمساء", summary: "آية الكرسي", contents: "آية الكرسي والأذكار",
  durationDays: 7 as const, minutesPerDay: 10, version: 2, publishedAtUtc: "2026-10-01T00:00:00Z", safetyCheckedAtUtc: "2026-10-01T00:00:00Z", isCurrent: true,
  author: { id: "a1", displayName: "الشيخ المعدّ", bio: "نبذة", consentDate: "2026-09-01" },
  days: Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    items: [
      { kind: "Note", text: "اقرأ بتدبّر.", repeat: 1 },
      { kind: "Quran", quranKey, title: "آية الكرسي", repeat: 3 },
      { kind: "Dhikr", title: "ذكر", text: "بِسْمِ اللَّهِ", source: "رواه أبو داود (5088)", repeat: 3 },
    ],
  })),
});

describe("خطط الخادم", () => {
  it("تُحوَّل وتُقرأ آياتها من المصحف المدقّق بمفتاحها، ومعدّها مضمَّن", () => {
    const p = fromServerPlan(server())!;
    expect(p.days[0].items[1]).toMatchObject({ kind: "quran", key: "kursi", ref: { surah: 2, fromAyah: 255, toAyah: 255 }, repeat: 3 });
    expect(planAuthor(p)?.displayName).toBe("الشيخ المعدّ");
    expect(p.remote?.isCurrent).toBe(true);
  });

  it("مفتاح مقطع غير معروف يُسقط الخطة كلها — لا نص قرآني من مصدر آخر", () => {
    expect(fromServerPlan(server("baqarah-full"))).toBeNull();
  });

  it("المنشور يحلّ محل التجريبي، والمستبدل لا يُعرض للبدء ويبقى لمن سجّل فيه", () => {
    const current = fromServerPlan(server())!;
    const old = { ...fromServerPlan({ ...server(), id: "old" })!, remote: { ...current.remote!, isCurrent: false } };
    setRemotePlans([current, old]);
    expect(listPlans().map((p) => p.id)).toEqual([current.id]);
    expect(findPlan("old")).toBeDefined();
    setRemotePlans([]);
    expect(listPlans()).toBe(bundledPlans);
  });

  it("قائمة المقاطع في الخادم تطابق مفاتيح المصحف المضمَّن حرفياً", () => {
    const cs = readFileSync(resolve(process.cwd(), "../src/Sanad.Domain/Companion/PlanContent.cs"), "utf8");
    const block = cs.slice(cs.indexOf("QuranPassageKeys"), cs.indexOf("};", cs.indexOf("QuranPassageKeys")));
    const keys = [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(Object.keys(quran).sort());
  });
});
