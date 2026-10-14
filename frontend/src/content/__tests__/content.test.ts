import { describe, expect, it } from "vitest";
import { LIBRARY, expandRef } from "../library";
import { MYTHS, searchMyths } from "../myths";
import { PROGRAMS } from "../programs";
import { QUIZ, evaluateQuiz } from "../quiz";

describe("سلامة المحتوى", () => {
  it("كل مهمة في كل برنامج تشير لعنصر موجود، وأيام البرنامج كاملة ومرقّمة", () => {
    for (const p of PROGRAMS) {
      expect(p.plan).toHaveLength(p.days);
      p.plan.forEach((d, i) => {
        expect(d.day).toBe(i + 1);
        const ids = d.tasks.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of d.tasks) expect(LIBRARY[t.itemId], `${p.id} يوم ${d.day}: ${t.itemId}`).toBeDefined();
      });
    }
  });

  it("الآيات من المصحف المشترك كاملة بأرقامها", () => {
    for (const it of Object.values(LIBRARY)) for (const r of it.refs ?? []) expect(expandRef(r).length, r).toBeGreaterThan(0);
    expect(expandRef("ikhlas").map((a) => a.ayah)).toEqual([1, 2, 3, 4]);
    expect(expandRef("sharh")).toHaveLength(8);
    expect(expandRef("kursi")[0].ayah).toBe(255);
  });

  it("كل ذكر أو آية له مصدر، أو هو عادة مساندة", () => {
    for (const it of Object.values(LIBRARY)) if (it.kind === "dhikr") expect(it.source, it.id).toBeTruthy();
  });

  it("لا وعود علاجية ولا تصنيف للحالة في أي نص ثابت (البنود 2 و3)", () => {
    const texts = [
      ...Object.values(LIBRARY).flatMap((i) => [i.title, i.note ?? "", i.text ?? ""]).filter((t) => !t.includes("اشفِ أنت الشافي")),
      ...PROGRAMS.flatMap((p) => [p.title, p.tagline, p.description, p.forWhom, ...p.plan.map((d) => d.title)]),
      ...QUIZ.flatMap((q) => [q.question, ...q.options.map((o) => o.label)]),
    ].join("\n");
    for (const banned of ["شفاء مضمون", "علاج مضمون", "علاج ناجع", "نضمن", "مضمون النتيجة", "أنت محسود", "أنت مسحور", "ممسوس"]) {
      expect(texts).not.toContain(banned);
    }
  });

  it("ميزان الوعي يجد الممارسة رغم العامية والتشكيل والهمزات", () => {
    expect(searchMyths("التبخير بملح الهملايا لطرد الطاقة السلبية")[0].id).toBe("himalayan-salt");
    expect(searchMyths("الخرزة الزرقاء")[0].id).toBe("amulets");
    expect(searchMyths("قانونُ الجَذْب")[0].id).toBe("law-of-attraction");
    expect(searchMyths("طلب اسم أمي")[0]?.id).toBe("mother-name");
    expect(searchMyths("كلمة لا علاقة لها إطلاقاً xyz")).toHaveLength(0);
    expect(new Set(MYTHS.map((m) => m.id)).size).toBe(MYTHS.length);
  });

  it("الاختبار يقترح برنامجاً موجوداً دائماً", () => {
    const best = Object.fromEntries(QUIZ.map((q) => [q.id, 2]));
    const worst = Object.fromEntries(QUIZ.map((q) => [q.id, 0]));
    expect(evaluateQuiz(best).tier.title).toBe("وعيٌ راسخ");
    expect(evaluateQuiz(worst).programId).toBe("quiet-nights-14");
    expect(PROGRAMS.some((p) => p.id === evaluateQuiz({ ...best, "q-self": 0 }).programId)).toBe(true);
  });
});
