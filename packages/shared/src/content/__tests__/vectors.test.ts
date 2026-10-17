import { describe, expect, it } from "vitest";
import { normalizeArabic } from "../../lib/arabic";
import { requiresEmergencyReferral } from "../../safety/riskSignals";
import { searchMyths } from "../companion/myths";
import { currentProgramDay } from "../companion/programs";
import { QUIZ, evaluateQuiz } from "../companion/quiz";
import { journalTrends, sessionsDelta, type CheckIn, type SessionRating } from "../companion/journal";
import { collections, suggestedWird } from "../ruqyah";
import { buildEntries, mergeCounts, parseTime, slotForHour, wirdPayload, type PublishedDua } from "../wird";
import vectors from "../../../test-vectors/companion.json";

// المتجهات نفسها يشغّلها تطبيق Flutter (mobile_flutter/test/vectors_test.dart) — ADR-0023
const v = vectors;

/** "all-N" أو { base: N, <id>: score } ← إجابات لكل الأسئلة. */
function expandAnswers(spec: string | Record<string, number>): Record<string, number> {
  if (typeof spec === "string") return Object.fromEntries(QUIZ.map((q) => [q.id, Number(spec.split("-")[1])]));
  const { base, ...rest } = spec;
  return { ...Object.fromEntries(QUIZ.map((q) => [q.id, base])), ...rest };
}

describe("متجهات التطابق مع Flutter", () => {
  it.each(v.normalize as [string, string][])("توحيد %s", (input, out) => expect(normalizeArabic(input)).toBe(out));
  it.each(v.risk.positive as string[])("خطر: %s", (t) => expect(requiresEmergencyReferral(t)).toBe(true));
  it.each(v.risk.negative as string[])("آمن: %s", (t) => expect(requiresEmergencyReferral(t)).toBe(false));
  it.each(v.mythSearch as { query: string; first: string | null }[])("الميزان: $query", ({ query, first }) =>
    expect(searchMyths(query)[0]?.id ?? null).toBe(first),
  );
  it.each(v.quiz as unknown as { answers: string | Record<string, number>; score: number; tier: string; programId: string }[])(
    "الاختبار $answers",
    ({ answers, score, tier, programId }) => {
      const r = evaluateQuiz(expandAnswers(answers));
      expect([r.score, r.tier.title, r.programId]).toEqual([score, tier, programId]);
    },
  );
  it.each(v.programDay as { startedOn: string | null; length: number; today: string; day: number }[])(
    "يوم البرنامج $startedOn ← $today",
    ({ startedOn, length, today, day }) => expect(currentProgramDay(startedOn, length, today)).toBe(day),
  );
});

describe("متجهات مذكّرتي مع Flutter", () => {
  const j = v.journal as unknown as {
    trends: { name: string; today: string; checkIns: Record<string, CheckIn>; activeDays: Record<string, boolean>; expect: unknown }[];
    sessionsDelta: { sessions: SessionRating[]; expect: number };
  };
  it.each(j.trends)("اتجاه: $name", ({ checkIns, activeDays, today, expect: e }) => expect(journalTrends(checkIns, activeDays, today)).toEqual(e));
  it("متوسط فرق الجلسات", () => expect(sessionsDelta(j.sessionsDelta.sessions)).toBe(j.sessionsDelta.expect));
});

describe("متجهات الورد مع Flutter", () => {
  const w = v.wird as unknown as {
    slotForHour: [number, string | null][];
    suggestedWird: [number, string, string][];
    mergeCounts: { local: Record<string, number>; server: Record<string, number> | null; expect: Record<string, number> }[];
    payload: { collectionId: string; day: string; duas: PublishedDua[]; counts: Record<string, number>; entryKeys: string[]; expect: unknown };
    parseTime: [string, { hour: number; minute: number } | null][];
  };
  it.each(w.slotForHour)("وقت الورد للساعة %i", (h, id) => expect(slotForHour(h)?.id ?? null).toBe(id));
  it.each(w.suggestedWird)("الورد المقترح للساعة %i", (h, id, label) => expect(suggestedWird(h)).toEqual({ id, label }));
  it.each(w.mergeCounts)("الدمج", ({ local, server, expect: e }) => expect(mergeCounts(local, server ?? undefined)).toEqual(e));
  it("جسم الحفظ", () => {
    const sleep = collections.find((c) => c.id === w.payload.collectionId)!;
    const entries = buildEntries(sleep.id, sleep.items, w.payload.duas);
    expect(entries.map((e) => e.key)).toEqual(w.payload.entryKeys);
    expect(wirdPayload(sleep.id, w.payload.day, entries, w.payload.counts)).toEqual(w.payload.expect);
  });
  it.each(w.parseTime)("الوقت %s", (t, e) => expect(parseTime(t)).toEqual(e));
});
