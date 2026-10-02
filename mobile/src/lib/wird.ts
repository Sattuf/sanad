import { mergeCounts, bumpCount, countCompleted, localDay, wirdApi, wirdPayload, type Counts, type Entry } from "@sanad/shared/content/wird";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSignedIn } from "@/lib/queries";
import { pruneKeys, readJson, writeJson } from "@/lib/storage";

export const wird = wirdApi(api);

const PREFIX = "sanad.wird.";
const storageKey = (collectionId: string, day: string) => `${PREFIX}${collectionId}.${day}`;

/** تقدّم الأيام الماضية لا حاجة له على الجهاز — الحساب يحفظ السجل. */
export const pruneOldWird = () => pruneKeys(PREFIX, (k) => k.endsWith(`.${localDay()}`));

export function usePublishedDuas() {
  return useQuery({ queryKey: ["ruqyah-duas"], queryFn: wird.publishedDuas, staleTime: 10 * 60_000, retry: false });
}

export function useMyWird() {
  const signedIn = useSignedIn();
  const day = localDay();
  return useQuery({ queryKey: ["my-wird", day], queryFn: () => wird.mine(day), enabled: signedIn, staleTime: 30_000, retry: false });
}

/**
 * عدّاد الورد: يُحفظ فوراً في الجهاز (يعمل دون اتصال وبلا حساب)، ويُدمج مع الحساب ويُزامَن معه بعد آخر نقرة بثانية.
 */
export function useWirdProgress(collectionId: string, entries: Entry[]) {
  const day = localDay();
  const key = storageKey(collectionId, day);
  const signedIn = useSignedIn();
  const qc = useQueryClient();
  const remote = useMyWird();
  const [local, setLocal] = useState<Counts>({});
  const [loaded, setLoaded] = useState(false);
  // بعد «ابدأ من جديد» تُهمل نسخة الحساب القديمة حتى تصل نسخة أحدث بعد الحفظ
  const [ignored, setIgnored] = useState<Counts | undefined>(undefined);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    void readJson<Counts>(key, {}).then((stored) => {
      if (!alive) return;
      setLocal((current) => mergeCounts(stored, current));
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // ما في الحساب يُدمج عند العرض (الأكبر يغلب) — لا يضيع تقدّم الجهاز ولا الحساب
  const server = remote.data?.collections.find((c) => c.collectionId === collectionId)?.counts;
  const effectiveServer = server && server !== ignored ? server : undefined;
  const counts = useMemo(() => mergeCounts(local, effectiveServer), [local, effectiveServer]);

  useEffect(() => {
    if (loaded) void writeJson(key, counts);
  }, [key, counts, loaded]);

  useEffect(() => {
    if (!signedIn || !dirty.current || !entries.length) return;
    const t = setTimeout(() => {
      dirty.current = false;
      wird
        .save(wirdPayload(collectionId, day, entries, counts))
        .then(() => qc.invalidateQueries({ queryKey: ["my-wird"] }))
        .catch(() => {
          dirty.current = true; // يُعاد مع النقرة التالية
        });
    }, 1000);
    return () => clearTimeout(t);
  }, [signedIn, counts, entries, collectionId, day, qc]);

  const bump = useCallback((entry: Entry) => {
    dirty.current = true;
    setLocal((c) => bumpCount(mergeCounts(c, effectiveServer), entry));
  }, [effectiveServer]);

  const reset = useCallback(() => {
    dirty.current = true;
    setIgnored(effectiveServer);
    setLocal({});
  }, [effectiveServer]);

  return { counts, bump, reset, completed: countCompleted(entries, counts), loaded, synced: signedIn };
}
