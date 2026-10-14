import { create } from "zustand";
import { mediaUrl } from "../../api/client";
import { quran, type QuranKey } from "@sanad/shared/content/quran";

/*
  تلاوة الآيات آية بآية بمشغّل واحد مشترك: لا تتداخل تلاوتان، والآية الجارية تُظلَّل في النص.
  الصوت يخدمه سند نفسه (/api/v1/public/recitation) بعد جلبه من everyayah.com مرة واحدة.
*/

export const reciters = [
  { id: "Alafasy_128kbps", name: "مشاري العفاسي" },
  { id: "Husary_128kbps", name: "محمود خليل الحصري" },
  { id: "Minshawy_Murattal_128kbps", name: "محمد صديق المنشاوي" },
  { id: "Abdul_Basit_Murattal_192kbps", name: "عبد الباسط عبد الصمد" },
] as const;

const RECITER_KEY = "sanad.ruqyah.reciter";

/** مقطع في طابور التلاوة: عنصر في المجموعة (itemIndex) ومرجعه القرآني. */
export interface QueueEntry { itemIndex: number; ref: QuranKey }

interface RecitationState {
  reciter: string;
  queue: QueueEntry[];
  position: number; // موضع المقطع في الطابور
  ayah: number; // فهرس الآية داخل المقطع
  status: "idle" | "loading" | "playing" | "paused" | "error";
  setReciter: (id: string) => void;
  play: (queue: QueueEntry[]) => void;
  toggle: () => void;
  stop: () => void;
}

function readReciter(): string {
  try {
    const v = localStorage.getItem(RECITER_KEY);
    return reciters.some((r) => r.id === v) ? v! : reciters[0].id;
  } catch {
    return reciters[0].id;
  }
}

export const ayahAudioPath = (reciter: string, surah: number, ayah: number) => `/api/v1/public/recitation/${reciter}/${surah}/${ayah}`;

let audio: HTMLAudioElement | null = null;
let preload: HTMLAudioElement | null = null;

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", () => advance());
    audio.addEventListener("playing", () => useRecitation.setState({ status: "playing" }));
    audio.addEventListener("waiting", () => useRecitation.setState({ status: "loading" }));
    audio.addEventListener("error", () => useRecitation.setState({ status: "error" }));
  }
  return audio;
}

function srcFor(state: Pick<RecitationState, "reciter" | "queue">, position: number, ayah: number): string | null {
  const entry = state.queue[position];
  if (!entry) return null;
  const p = quran[entry.ref];
  return mediaUrl(ayahAudioPath(state.reciter, p.surah, p.from + ayah));
}

/** الموضع التالي في الطابور (آية تالية، أو أول آية في المقطع التالي). */
function nextOf(state: RecitationState): { position: number; ayah: number } | null {
  const entry = state.queue[state.position];
  if (!entry) return null;
  const p = quran[entry.ref];
  if (state.ayah + 1 < p.ayat.length) return { position: state.position, ayah: state.ayah + 1 };
  if (state.position + 1 < state.queue.length) return { position: state.position + 1, ayah: 0 };
  return null;
}

function start(position: number, ayah: number) {
  const s = useRecitation.getState();
  const src = srcFor(s, position, ayah);
  if (!src) return;
  const el = element();
  el.src = src;
  useRecitation.setState({ position, ayah, status: "loading" });
  el.play().catch(() => useRecitation.setState({ status: "error" }));
  // تحميل الآية التالية مسبقاً ليكون الانتقال بلا فجوة
  const next = nextOf({ ...s, position, ayah });
  if (next) {
    preload ??= new Audio();
    preload.preload = "auto";
    preload.src = srcFor(s, next.position, next.ayah)!;
  }
}

function advance() {
  const next = nextOf(useRecitation.getState());
  if (next) start(next.position, next.ayah);
  else useRecitation.setState({ status: "idle", queue: [], position: 0, ayah: 0 });
}

export const useRecitation = create<RecitationState>((set, get) => ({
  reciter: readReciter(),
  queue: [],
  position: 0,
  ayah: 0,
  status: "idle",
  setReciter: (id) => {
    try {
      localStorage.setItem(RECITER_KEY, id);
    } catch {
      /* تجاهل */
    }
    const wasActive = get().status === "playing" || get().status === "loading";
    set({ reciter: id });
    if (wasActive) start(get().position, get().ayah);
  },
  play: (queue) => {
    if (!queue.length) return;
    set({ queue });
    start(0, 0);
  },
  toggle: () => {
    const el = element();
    const { status } = get();
    if (status === "playing" || status === "loading") {
      el.pause();
      set({ status: "paused" });
    } else if (status === "paused") {
      el.play().catch(() => set({ status: "error" }));
    } else if (status === "error") {
      start(get().position, get().ayah);
    }
  },
  stop: () => {
    audio?.pause();
    set({ status: "idle", queue: [], position: 0, ayah: 0 });
  },
}));

/** هل العنصر itemIndex هو الجاري الآن؟ وأي آية فيه؟ */
export function useActiveAyah(itemIndex: number): number | null {
  return useRecitation((s) => (s.status !== "idle" && s.queue[s.position]?.itemIndex === itemIndex ? s.ayah : null));
}
