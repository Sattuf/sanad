import { useCallback, useEffect, useRef, useState } from "react";

/*
  تشغيل تلاوات الآيات مع حفظها على الجهاز (Cache API) — فتعمل «السكينة» والمرشد بلا إنترنت بعد أول استماع.
  نجلب الملف (CORS مسموح من everyayah) ونشغّله كـ Blob محلي، لأن عنصر <audio> لا يتعامل جيداً
  مع ردود opaque المخزّنة عند طلبات Range.
*/
const CACHE = "sanad-audio-v1";
const objectUrls = new Map<string, string>();

export async function localAudioUrl(url: string): Promise<string> {
  const known = objectUrls.get(url);
  if (known) return known;
  let blob: Blob | null = null;
  try {
    const cache = "caches" in window ? await caches.open(CACHE) : null;
    const hit = await cache?.match(url);
    if (hit) blob = await hit.blob();
    else {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      await cache?.put(url, res.clone()).catch(() => undefined);
      blob = await res.blob();
    }
  } catch {
    return url; // آخر محاولة: الرابط المباشر
  }
  const local = URL.createObjectURL(blob);
  objectUrls.set(url, local);
  return local;
}

export async function precacheAudio(urls: string[], onProgress?: (done: number) => void) {
  let n = 0;
  for (const u of urls) {
    await localAudioUrl(u).catch(() => undefined);
    onProgress?.(++n);
  }
}

export async function cachedCount(urls: string[]): Promise<number> {
  if (!("caches" in window)) return 0;
  const cache = await caches.open(CACHE);
  const hits = await Promise.all(urls.map((u) => cache.match(u)));
  return hits.filter(Boolean).length;
}

/**
 * مشغّل قائمة: يشغّل المقاطع بالترتيب، ويكرر القائمة كاملة `repeat` مرة.
 * index = موضع المقطع الجاري (للتظليل)، round = الجولة الحالية.
 */
export function usePlaylist(urls: string[], repeat = 1) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(-1);
  const [round, setRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const state = useRef({ index: -1, round: 1, stopped: true });
  const key = urls.join("|");

  const stop = useCallback(() => {
    state.current.stopped = true;
    audio.current?.pause();
    setIndex(-1);
    setRound(1);
  }, []);

  const playAt = useCallback(
    async (i: number, r: number) => {
      if (state.current.stopped) return;
      if (i >= urls.length) {
        if (r < repeat) return playAt(0, r + 1);
        stop();
        return;
      }
      state.current = { index: i, round: r, stopped: false };
      setIndex(i);
      setRound(r);
      setLoading(true);
      const src = await localAudioUrl(urls[i]);
      setLoading(false);
      if (state.current.stopped) return;
      const el = (audio.current ??= new Audio());
      el.src = src;
      el.onended = () => void playAt(i + 1, r);
      el.onerror = () => {
        setFailed(true);
        stop();
      };
      await el.play().catch(() => {
        setFailed(true);
        stop();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, repeat, stop],
  );

  const play = useCallback(
    (from = 0) => {
      setFailed(false);
      state.current.stopped = false;
      void playAt(from, 1);
    },
    [playAt],
  );

  useEffect(() => () => {
    state.current.stopped = true;
    audio.current?.pause();
  }, [key]);

  return { play, stop, index, round, playing: index >= 0, loading, failed };
}
