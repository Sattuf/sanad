/*
  «مذكّرتي» — المقاييس اليومية وقراءة الاتجاه، مشتركة بين الويب وتطبيق Flutter (ADR-0023).
  نعرض الاتجاه والتزامن مع أيام الالتزام بلغة محايدة؛ لا «تحسّنت بسبب الرقية» ولا تشخيص (البندان 2 و3).
  منطق journalTrends تحرسه متجهات test-vectors/companion.json (journal) في الطرفين.
*/
export type Scale = 0 | 1 | 2 | 3 | 4;
export type MetricKey = "calm" | "sleep" | "energy" | "mood";

export interface CheckIn {
  day: string;
  calm: Scale;
  sleep: Scale;
  energy: Scale;
  mood: Scale;
  note?: string;
  updatedAt: string;
}

export interface SessionRating {
  at: string;
  kind: "ruqyah" | "sakina";
  before: number;
  after: number;
}

export interface JournalData {
  checkIns: Record<string, CheckIn>;
  sessions: SessionRating[];
}

export const JOURNAL_METRICS: Array<{ key: MetricKey; label: string; low: string; high: string }> = [
  { key: "calm", label: "الهدوء", low: "قلق شديد", high: "مطمئن" },
  { key: "sleep", label: "جودة النوم", low: "أرق", high: "نوم هانئ" },
  { key: "energy", label: "النشاط", low: "مُنهَك", high: "نشيط" },
  { key: "mood", label: "المزاج", low: "مثقل", high: "منشرح" },
];

/** عدد الأيام في الرسم، والحد الأدنى من التسجيلات لعرضه. */
export const TREND_DAYS = 14;
export const TREND_MIN_ENTRIES = 3;

/** يوم بصيغة YYYY-MM-DD بعد n يوماً (تقويمياً، بلا مناطق زمنية). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export interface Shift {
  now: number;
  before: number;
}

export interface JournalTrends {
  /** الأيام الأربعة عشر، الأقدم أولاً */
  days: string[];
  count: number;
  /** الهدوء والنوم: الأسبوع الأخير مقابل الذي قبله (إن وُجد يومان على الأقل في كلٍّ منهما) */
  calm: Shift | null;
  sleep: Shift | null;
  /** متوسط الهدوء في أيام الالتزام مقابل غيرها (يومان على الأقل في كلٍّ منهما) */
  committedCalm: { committed: number; other: number } | null;
  /** تنبيه «خذ بالأسباب» حين يكون النوم أو الهدوء منخفضاً معظم الأيام (١٠ تسجيلات على الأقل) */
  low: "sleep" | "calm" | null;
}

export function journalTrends(checkIns: Record<string, CheckIn>, activeDays: Record<string, unknown>, today: string): JournalTrends {
  const days = Array.from({ length: TREND_DAYS }, (_, i) => addDays(today, i - (TREND_DAYS - 1)));
  const withEntries = days.filter((d) => checkIns[d]);
  const committed = (d: string) => Boolean(activeDays[d]);
  const of = (ds: string[]) => ds.filter((d) => checkIns[d]).map((d) => checkIns[d]);
  const recent = of(days.slice(7));
  const earlier = of(days.slice(0, 7));
  const inC = of(withEntries.filter(committed));
  const outC = of(withEntries.filter((d) => !committed(d)));
  const shift = (k: MetricKey): Shift | null =>
    recent.length >= 2 && earlier.length >= 2 ? { now: avg(recent.map((e) => e[k])), before: avg(earlier.map((e) => e[k])) } : null;
  const all = of(withEntries);
  const lowSleep = all.length >= 10 && avg(all.map((e) => e.sleep)) <= 1;
  const lowCalm = all.length >= 10 && avg(all.map((e) => e.calm)) <= 1;
  return {
    days,
    count: withEntries.length,
    calm: shift("calm"),
    sleep: shift("sleep"),
    committedCalm: inC.length >= 2 && outC.length >= 2 ? { committed: avg(inC.map((e) => e.calm)), other: avg(outC.map((e) => e.calm)) } : null,
    low: lowSleep ? "sleep" : lowCalm ? "calm" : null,
  };
}

/** فرق يُعدّ «استقراراً» في نص الاتجاه. */
export const STABLE_DELTA = 0.3;

/** متوسط الفرق (بعد − قبل) لآخر عشر جلسات. */
export function sessionsDelta(sessions: SessionRating[]): number {
  return avg(sessions.slice(-10).map((s) => s.after - s.before));
}
