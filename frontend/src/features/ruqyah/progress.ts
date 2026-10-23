import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { useMe } from "../../api/hooks";
import { collections, type Item } from "@sanad/shared/content/ruqyah";

import {
  buildEntries,
  countCompleted,
  localDay,
  mergeCounts,
  wirdApi,
  wirdPayload,
  type Entry,
  type MyWird,
} from "@sanad/shared/content/wird";

// المنطق (المفاتيح، الدمج، العدّ، جسم الحفظ) مشترك مع الجوال في packages/shared/content/wird.ts
export { localDay, type Entry, type MyWird } from "@sanad/shared/content/wird";
export type { PublishedDua, WirdCollectionProgress } from "@sanad/shared/content/wird";

const wird = wirdApi(api);

export function usePublishedDuas() {
  return useQuery({
    queryKey: ["ruqyah-duas"],
    queryFn: wird.publishedDuas,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** النصوص الثابتة ثم الأدعية المنشورة بعد المراجعة لهذه المجموعة. */
export function useCollectionEntries(collectionId: string, items: Item[]): Entry[] {
  const { data } = usePublishedDuas();
  return useMemo(() => buildEntries(collectionId, items, data), [data, collectionId, items]);
}

export function useMyWird(enabled: boolean) {
  const day = localDay();
  return useQuery({
    queryKey: ["my-wird", day],
    queryFn: () => wird.mine(day),
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

  // دمج ما في الحساب مع ما في الجهاز (الأكبر يغلب) — لا يضيع تقدّم أي منهما.
  // عند وصول نسخة جديدة من الخادم، أثناء الرسم لا في effect (لا رسم إضافي بالقيم القديمة)
  const server = remote.data?.collections.find((c) => c.collectionId === collectionId)?.counts;
  const [mergedFrom, setMergedFrom] = useState<typeof server>(undefined);
  if (server && server !== mergedFrom) {
    setMergedFrom(server);
    setCounts((local) => mergeCounts(local, server));
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(counts));
    } catch {
      /* التخزين اختياري */
    }
  }, [storageKey, counts]);

  const completed = countCompleted(entries, counts);

  // حفظ مؤجَّل في الحساب بعد آخر نقرة بثانية — لا طلب مع كل ضغطة عدّاد
  useEffect(() => {
    if (!signedIn || !dirty.current || !entries.length) return;
    const t = window.setTimeout(() => {
      dirty.current = false;
      wird.save(wirdPayload(collectionId, day, entries, counts))
        .then(() => qc.invalidateQueries({ queryKey: ["my-wird"] }))
        .catch(() => { dirty.current = true; });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [signedIn, counts, entries, collectionId, day, qc]);

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
