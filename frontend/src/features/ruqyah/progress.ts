import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { useMe } from "../../api/hooks";
import { collections, type Item } from "@sanad/shared/content/ruqyah";

/*
  الورد اليومي: يُحفظ فوراً في الجهاز، ويُزامَن مع الحساب لمن سجّل دخوله ليتابع من أي جهاز.
  مفتاح كل عنصر ثابت: رقمه في المجموعة للنصوص الأساسية، و"d:<id>" للأدعية المضافة بعد المراجعة.
*/

export interface WirdCollectionProgress { collectionId: string; counts: Record<string, number>; completedItems: number; totalItems: number }
export interface MyWird { day: string; collections: WirdCollectionProgress[]; streak: number; completedDays: string[] }

export interface PublishedDua { id: string; collectionId: string; title: string; text: string; source: string; note: string | null; repeat: number; sortOrder: number }

/** عنصر معروض في القارئ بمفتاحه الثابت. */
export interface Entry { key: string; item: Item }

/** تاريخ جهاز المستخدم (لا UTC): الورد يتبع يومه هو. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function usePublishedDuas() {
  return useQuery({
    queryKey: ["ruqyah-duas"],
    queryFn: () => api.get<PublishedDua[]>("/api/v1/public/ruqyah/duas", { auth: false }),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** النصوص الثابتة ثم الأدعية المنشورة بعد المراجعة لهذه المجموعة. */
export function useCollectionEntries(collectionId: string, items: Item[]): Entry[] {
  const { data } = usePublishedDuas();
  return useMemo(() => {
    const extra = (data ?? []).filter((d) => d.collectionId === collectionId).sort((a, b) => a.sortOrder - b.sortOrder);
    return [
      ...items.map((item, i) => ({ key: String(i), item })),
      ...extra.map((d) => ({
        key: `d:${d.id}`,
        item: { kind: "dua", title: d.title, text: d.text, source: d.source, note: d.note ?? undefined, repeat: d.repeat } satisfies Item,
      })),
    ];
  }, [data, collectionId, items]);
}

export function useMyWird(enabled: boolean) {
  const day = localDay();
  return useQuery({
    queryKey: ["my-wird", day],
    queryFn: () => api.get<MyWird>(`/api/v1/me/wird?day=${day}`),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

function readLocal(key: string): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function useDailyProgress(collectionId: string, entries: Entry[]) {
  const day = localDay();
  const storageKey = `sanad.ruqyah.progress.${collectionId}.${day}`;
  const { data: me } = useMe();
  const signedIn = Boolean(me);
  const qc = useQueryClient();
  const remote = useMyWird(signedIn);
  const [counts, setCounts] = useState<Record<string, number>>(() => readLocal(storageKey));
  const dirty = useRef(false);

  // دمج ما في الحساب مع ما في الجهاز (الأكبر يغلب) — لا يضيع تقدّم أي منهما
  useEffect(() => {
    const server = remote.data?.collections.find((c) => c.collectionId === collectionId)?.counts;
    if (!server) return;
    setCounts((local) => {
      const merged = { ...local };
      for (const [k, v] of Object.entries(server)) merged[k] = Math.max(merged[k] ?? 0, v);
      return merged;
    });
  }, [remote.data, collectionId]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(counts));
    } catch {
      /* التخزين اختياري */
    }
  }, [storageKey, counts]);

  const completed = entries.filter((e) => (counts[e.key] ?? 0) >= (e.item.repeat ?? 1)).length;

  // حفظ مؤجَّل في الحساب بعد آخر نقرة بثانية — لا طلب مع كل ضغطة عدّاد
  useEffect(() => {
    if (!signedIn || !dirty.current || !entries.length) return;
    const t = window.setTimeout(() => {
      dirty.current = false;
      const known = Object.fromEntries(entries.map((e) => [e.key, Math.min(counts[e.key] ?? 0, 1000)]));
      api.put("/api/v1/me/wird", { collectionId, day, counts: known, completedItems: completed, totalItems: entries.length })
        .then(() => qc.invalidateQueries({ queryKey: ["my-wird"] }))
        .catch(() => { dirty.current = true; });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [signedIn, counts, entries, collectionId, day, completed, qc]);

  const bump = useCallback((key: string, max: number) => {
    dirty.current = true;
    setCounts((c) => ({ ...c, [key]: Math.min(max, (c[key] ?? 0) + 1) }));
  }, []);
  const reset = useCallback(() => {
    dirty.current = true;
    setCounts({});
  }, []);

  return { counts, bump, reset, completed, synced: signedIn };
}

/** هل أُتمّت المجموعة اليوم (من الجهاز أو الحساب)؟ للتذكير داخل الصفحة. */
export function isCompletedToday(collectionId: string, wird?: MyWird): boolean {
  const remote = wird?.collections.find((c) => c.collectionId === collectionId);
  if (remote && remote.totalItems > 0 && remote.completedItems >= remote.totalItems) return true;
  const c = collections.find((x) => x.id === collectionId);
  if (!c) return false;
  const local = readLocal(`sanad.ruqyah.progress.${collectionId}.${localDay()}`);
  return c.items.every((it, i) => (local[String(i)] ?? 0) >= (it.repeat ?? 1));
}
