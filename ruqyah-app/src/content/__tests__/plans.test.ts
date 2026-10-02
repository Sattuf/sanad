import { describe, expect, it } from "vitest";
import { quran } from "@sanad/shared/content/quran";
import { DURATIONS, findAuthor, isDraft, plans } from "../plans";

// كلمات لا تظهر في وصف أي خطة (content-guardrails.md §3، SKILL.md «الكتابة»)
const FORBIDDEN = /علاج|تشخيص|إصابة|مسحور|ممسوس|معيون|المس |السحر المأكول|العاشق|شفاء مضمون|فك السحر|ضمان|نسبة نجاح/;

describe("الخطط", () => {
  it("مُدد الخطط من المدد المعتمدة فقط، وعدد الأيام يطابق المدة", () => {
    for (const p of plans) {
      expect(DURATIONS).toContain(p.durationDays);
      expect(p.days).toHaveLength(p.durationDays);
      expect(p.days.every((d) => d.items.length > 0)).toBe(true);
    }
  });

  it("لكل خطة معدّ، وما لم يصل إذنه تُعرض تجريبية", () => {
    for (const p of plans) {
      const a = findAuthor(p.authorId);
      expect(a).toBeDefined();
      if (!a!.consentRef) expect(isDraft(p)).toBe(true);
    }
  });

  it("الترتيب بالمدة ثم أبجدياً", () => {
    const d = plans.map((p) => p.durationDays);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("الوصف بالمحتوى والمدة، لا بالحالة ولا بوعد", () => {
    for (const p of plans) expect(`${p.title} ${p.summary} ${p.contents}`).not.toMatch(FORBIDDEN);
  });

  it("كل آية تشير إلى نص مدقّق موجود، وكل ذكر يحمل تخريجه", () => {
    for (const p of plans)
      for (const d of p.days)
        for (const i of d.items) {
          if (i.kind === "quran") {
            expect(quran[i.key]).toBeDefined();
            expect(i.ref.surah).toBe(quran[i.key].surah);
          }
          if (i.kind === "dhikr") expect(i.source.length).toBeGreaterThan(0);
        }
  });

  it("لا تُدرج أذكار الرؤى في أي ورد (لا تفسير أحلام)", () => {
    const titles = plans.flatMap((p) => p.days.flatMap((d) => d.items.map((i) => (i.kind === "note" ? "" : i.title))));
    expect(titles.some((t) => t.includes("الرؤيا"))).toBe(false);
  });
});
