import { describe, expect, it } from "vitest";
import { citedAyat, quran } from "../quran";
import { awarenessGuides, collections, guidePath, guides, healthGuides } from "../ruqyah";

// سلامة المحتوى المشترك بين الويب والجوال: نص القرآن مطابق حرفياً، وكل دعاء مخرَّج، ولا جرعات ولا وعود شفاء.
describe("content", () => {
  it("every Quran reference resolves to its full ayah range", () => {
    for (const c of collections)
      for (const it of c.items)
        if (it.kind === "quran") {
          const p = quran[it.ref];
          expect(p.ayat).toHaveLength(p.to - p.from + 1);
        }
  });

  it("Quran text quoted in an item title is byte-identical to its own passage", () => {
    let checked = 0;
    for (const c of collections)
      for (const it of c.items)
        if (it.kind === "quran")
          for (const [, text] of it.title.matchAll(/﴿([^﴾]+)﴾/g)) {
            checked++;
            expect(quran[it.ref].ayat.some((a) => a.includes(text)), `${c.id}: ${it.title}`).toBe(true);
          }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("every dua carries its takhrij", () => {
    for (const c of collections) for (const it of c.items) if (it.kind === "dua") expect(it.source.length).toBeGreaterThan(5);
  });
});

describe("guides", () => {
  const quotes = guides.flatMap((g) =>
    g.sections.flatMap((s) => s.points.flatMap((p) => [...(p.evidence ?? "").matchAll(/﴿([^﴾]+)﴾\s*\[([^:\]]+):\s*(\d+)\]/g)])),
  );

  it("every Quran quote is byte-identical to the Mushaf text of the cited ayah", () => {
    expect(quotes.length).toBeGreaterThan(10);
    for (const [, text, surah, ayah] of quotes) {
      const full = citedAyat[`${surah.trim()}:${ayah}`];
      expect(full, `${surah}:${ayah} missing — rerun scripts/gen-quran.py`).toBeDefined();
      expect(full.includes(text), `${surah}:${ayah}`).toBe(true);
    }
  });

  it("guide ids are unique and awareness pages exist", () => {
    expect(new Set(guides.map((g) => g.id)).size).toBe(guides.length);
    expect(awarenessGuides.map((g) => g.id)).toEqual(["sihr", "sihr-response", "yoga", "energy", "occult"]);
  });
});

describe("health guides", () => {
  const text = (g: (typeof healthGuides)[number]) =>
    [g.title, g.subtitle, g.intro, ...g.sections.flatMap((s) => [s.heading, ...s.points.flatMap((p) => [p.text, p.evidence ?? ""])])].join(" ");

  it("live under /health and are separate from the ruqyah guides", () => {
    expect(healthGuides.map((g) => g.id)).toEqual(["treatment-and-ruqyah", "anxiety-ocd-depression", "sleep-daily", "when-to-see-doctor", "choose-provider"]);
    for (const g of healthGuides) expect(guidePath(g)).toBe(`/health/${g.id}`);
    expect(guidePath(guides.find((g) => g.id === "sihr")!)).toBe("/ruqyah/guide/sihr");
  });

  it("contain no dose, dose unit, or guaranteed-cure wording", () => {
    const forbidden = [/\d+\s*(ملغ|مغ|ملجم|مجم|مل|mg|mcg|ml)\b/i, /(ملغ|مليغرام|ملجم)/, /جرع(ة|ات|تين)/, /(حبة|قرص|كبسولة)\s*(يومياً|يوميا|كل|مرتين)/, /شفاء\s*(مضمون|مؤكد|تام|كامل)/, /نضمن/];
    for (const g of healthGuides) for (const re of forbidden) expect(text(g), `${g.id} ${re}`).not.toMatch(re);
  });

  it("point to emergency help where danger signs are listed", () => {
    for (const id of ["anxiety-ocd-depression", "when-to-see-doctor"])
      expect(healthGuides.find((g) => g.id === id)!.sections.some((s) => s.cta?.to === "/emergency")).toBe(true);
  });
});

