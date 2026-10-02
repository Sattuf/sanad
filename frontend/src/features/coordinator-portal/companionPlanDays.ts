// أيام خطة الرقية كأنماط تتناوب: اليوم d يأخذ النمط ((d-1) % عدد الأنماط). أسهل للمراجعة من أربعين يوماً منفصلة.

export type ItemKind = "Quran" | "Dhikr" | "Note";
export interface PlanItem { kind: ItemKind; quranKey?: string | null; title?: string | null; text?: string | null; source?: string | null; note?: string | null; repeat: number }
export interface PlanDay { day: number; items: PlanItem[] }

export const daysFromPatterns = (patterns: PlanItem[][], n: number): PlanDay[] =>
  Array.from({ length: n }, (_, i) => ({ day: i + 1, items: patterns[i % patterns.length].map(clean) }));

export const clean = (i: PlanItem): PlanItem =>
  i.kind === "Quran" ? { kind: i.kind, quranKey: i.quranKey, title: i.title, note: i.note || null, repeat: i.repeat }
  : i.kind === "Dhikr" ? { kind: i.kind, title: i.title, text: i.text, source: i.source, note: i.note || null, repeat: i.repeat }
  : { kind: i.kind, text: i.text, repeat: 1 };

/** يستنتج أقصر دورة تولّد أيام الخطة — حتى يُعدَّل المحفوظ بالمحرّر نفسه. */
export function patternsFromDays(days: PlanDay[]): PlanItem[][] {
  const sig = days.map((d) => JSON.stringify(d.items.map(clean)));
  for (let len = 1; len <= Math.min(7, days.length); len++)
    if (sig.every((s, i) => s === sig[i % len])) return days.slice(0, len).map((d) => d.items.map(clean));
  return days.map((d) => d.items.map(clean));
}

