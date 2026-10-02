import { useSyncExternalStore } from "react";
import { quran, type QuranKey } from "@sanad/shared/content/quran";
import { API_URL, hasApi } from "../api/client";
import { load, save } from "./storage";

/*
  التلاوة آية بآية بمشغّل واحد: لا تتداخل تلاوتان، والآية الجارية تُظلَّل في النص.
  الصوت يخدمه خادم سند (/api/v1/public/recitation) بعد جلبه من everyayah.com مرة واحدة، فلا يعرف المصدر من يستمع
  (ADR-0015، ADR-0016). القرّاء من قائمة السماح نفسها في الخادم. النص هو الأساس؛ الصوت اختياري.
  دون اتصال: تُحمَّل تلاوات ورد اليوم مسبقاً في ذاكرة الجهاز (Cache Storage) وتُشغَّل منها.
*/

export const reciters = [
  { id: "Alafasy_128kbps", name: "مشاري راشد العفاسي" },
  { id: "Husary_128kbps", name: "محمود خليل الحصري" },
  { id: "Minshawy_Murattal_128kbps", name: "محمد صديق المنشاوي" },
  { id: "Abdul_Basit_Murattal_192kbps", name: "عبد الباسط عبد الصمد" },
] as const;

export const RECITATION_SOURCE = "everyayah.com";
const CACHE = "sanad-recitation-v1";

export interface PlayerState {
  reciter: string;
  key: QuranKey | null;
  /** فهرس الآية داخل المقطع */
  ayah: number;
  status: "idle" | "loading" | "playing" | "paused" | "error";
}

const savedReciter = load<string>("reciter", "");
let state: PlayerState = {
  reciter: reciters.some((r) => r.id === savedReciter) ? savedReciter : reciters[0].id,
  key: null,
  ayah: 0,
  status: "idle",
};
const listeners = new Set<() => void>();
const set = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const usePlayer = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export const recitationAvailable = () => hasApi && typeof Audio !== "undefined";

export const ayahUrl = (reciter: string, surah: number, ayah: number) => `${API_URL}/api/v1/public/recitation/${reciter}/${surah}/${ayah}`;

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", advance);
    audio.addEventListener("playing", () => set({ status: "playing" }));
    audio.addEventListener("waiting", () => set({ status: "loading" }));
    audio.addEventListener("error", () => set({ status: "error" }));
  }
  return audio;
}

/** المحفوظ على الجهاز أولاً (يعمل دون اتصال)، وإلا من الخادم مباشرة. */
async function sourceFor(url: string): Promise<string> {
  try {
    const hit = await (await caches.open(CACHE)).match(url);
    if (hit) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(await hit.blob());
      return objectUrl;
    }
  } catch {
    /* لا Cache Storage (تصفح خاص) */
  }
  return url;
}

async function start(key: QuranKey, ayah: number) {
  const p = quran[key];
  set({ key, ayah, status: "loading" });
  const el = element();
  el.src = await sourceFor(ayahUrl(state.reciter, p.surah, p.from + ayah));
  try {
    await el.play();
  } catch {
    set({ status: "error" });
  }
}

function advance() {
  if (!state.key) return;
  const p = quran[state.key];
  if (state.ayah + 1 < p.ayat.length) void start(state.key, state.ayah + 1);
  else set({ status: "idle", key: null, ayah: 0 });
}

export const player = {
  /** يبدأ المقطع من أوله، أو يوقف/يستأنف إن كان هو الجاري. */
  toggle(key: QuranKey) {
    const el = element();
    if (state.key === key && state.status === "playing") {
      el.pause();
      set({ status: "paused" });
    } else if (state.key === key && state.status === "paused") {
      void el.play();
    } else {
      void start(key, 0);
    }
  },
  stop() {
    audio?.pause();
    set({ status: "idle", key: null, ayah: 0 });
  },
  setReciter(id: string) {
    if (!reciters.some((r) => r.id === id)) return;
    save("reciter", id);
    player.stop();
    set({ reciter: id });
  },
};

/** روابط كل آيات المقاطع المعطاة بالقارئ الحالي. */
export const urlsFor = (keys: QuranKey[], reciter = state.reciter) =>
  [...new Set(keys)].flatMap((k) => {
    const p = quran[k];
    return p.ayat.map((_, i) => ayahUrl(reciter, p.surah, p.from + i));
  });

/** هل كل آيات هذه المقاطع محفوظة على الجهاز؟ */
export async function isDownloaded(keys: QuranKey[]) {
  try {
    const cache = await caches.open(CACHE);
    const urls = urlsFor(keys);
    return urls.length > 0 && (await Promise.all(urls.map((u) => cache.match(u)))).every(Boolean);
  } catch {
    return false;
  }
}

/** تحميل تلاوات الورد للعمل دون اتصال. يعيد عدد ما حُمّل؛ ما فشل يُترك ويُشغَّل من الشبكة لاحقاً. */
export async function download(keys: QuranKey[], onProgress?: (done: number, total: number) => void) {
  const cache = await caches.open(CACHE);
  const urls = urlsFor(keys);
  let done = 0;
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await cache.put(url, res);
      }
    } catch {
      /* يُعاد لاحقاً */
    }
    onProgress?.(++done, urls.length);
  }
  return done;
}
