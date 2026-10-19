import type { ApiClient } from "../api/core";
import type { Item } from "./ruqyah";

/*
  الورد اليومي — منطق مشترك بين الويب والجوال: يُحفظ فوراً في الجهاز، ويُزامَن مع الحساب لمن سجّل دخوله.
  مفتاح كل عنصر ثابت: رقمه في المجموعة للنصوص الأساسية، و"d:<id>" للأدعية المضافة بعد المراجعة.
*/

export interface WirdCollectionProgress { collectionId: string; counts: Record<string, number>; completedItems: number; totalItems: number }
export interface MyWird { day: string; collections: WirdCollectionProgress[]; streak: number; completedDays: string[] }
export interface PublishedDua { id: string; collectionId: string; title: string; text: string; source: string; note: string | null; repeat: number; sortOrder: number }

/** عنصر معروض في القارئ بمفتاحه الثابت. */
export interface Entry { key: string; item: Item }

export type Counts = Record<string, number>;

/** حد أعلى للعدّاد المرسل للخادم — يطابق تحقق الخادم. */
export const MAX_COUNT = 1000;

/** تاريخ جهاز المستخدم (لا UTC): الورد يتبع يومه هو. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** النصوص الثابتة ثم الأدعية المنشورة بعد المراجعة لهذه المجموعة. */
export function buildEntries(collectionId: string, items: Item[], duas: PublishedDua[] = []): Entry[] {
  const extra = duas.filter((d) => d.collectionId === collectionId).sort((a, b) => a.sortOrder - b.sortOrder);
  return [
    ...items.map((item, i) => ({ key: String(i), item })),
    ...extra.map((d) => ({
      key: `d:${d.id}`,
      item: { kind: "dua", title: d.title, text: d.text, source: d.source, note: d.note ?? undefined, repeat: d.repeat } satisfies Item,
    })),
  ];
}

/** دمج تقدّم الجهاز مع الحساب — الأكبر يغلب، فلا يضيع تقدّم أي منهما. */
export function mergeCounts(local: Counts, server: Counts | undefined): Counts {
  if (!server) return local;
  const merged = { ...local };
  for (const [k, v] of Object.entries(server)) merged[k] = Math.max(merged[k] ?? 0, v);
  return merged;
}

export const target = (item: Item) => item.repeat ?? 1;

export const countCompleted = (entries: Entry[], counts: Counts) => entries.filter((e) => (counts[e.key] ?? 0) >= target(e.item)).length;

/** جسم الحفظ في الحساب: العناصر المعروفة فقط، وكل عدّاد ضمن الحد. */
export function wirdPayload(collectionId: string, day: string, entries: Entry[], counts: Counts) {
  return {
    collectionId,
    day,
    counts: Object.fromEntries(entries.map((e) => [e.key, Math.min(counts[e.key] ?? 0, MAX_COUNT)])),
    completedItems: countCompleted(entries, counts),
    totalItems: entries.length,
  };
}

export function wirdApi(api: ApiClient["api"]) {
  return {
    publishedDuas: () => api.get<PublishedDua[]>("/api/v1/public/ruqyah/duas", { auth: false }),
    mine: (day: string) => api.get<MyWird>(`/api/v1/me/wird?day=${encodeURIComponent(day)}`),
    save: (body: ReturnType<typeof wirdPayload>) => api.put<void>("/api/v1/me/wird", body),
  };
}

// ── أوقات التذكير ───────────────────────────────────────────────────────────

export type SlotId = "morning" | "evening" | "sleep";
export interface Slot { id: SlotId; label: string; collection: string; defaultTime: string }

export const slots: Slot[] = [
  { id: "morning", label: "أذكار الصباح", collection: "morning-evening", defaultTime: "06:30" },
  { id: "evening", label: "أذكار المساء", collection: "morning-evening", defaultTime: "17:30" },
  { id: "sleep", label: "أذكار النوم", collection: "sleep", defaultTime: "22:30" },
];

/** الوقت الذي يناسبه كل ورد بحسب الساعة المحلية — أو null خارج الأوقات. */
export function slotForHour(hour: number): Slot | null {
  if (hour >= 4 && hour < 11) return slots[0];
  if (hour >= 15 && hour < 20) return slots[1];
  if (hour >= 21 || hour < 2) return slots[2];
  return null;
}

/** "HH:mm" ← ساعة ودقيقة، أو null إن كانت غير صالحة. */
export function parseTime(value: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}
