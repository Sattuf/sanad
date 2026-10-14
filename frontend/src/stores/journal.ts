import { create } from "zustand";
import { vault, type UnlockedVault } from "../lib/vault";

/*
  مذكّرة السكينة — الحالة في الذاكرة فقط بعد فك التشفير، وتُمسح عند القفل.
  القفل التلقائي بعد 5 دقائق خمول أو عند إخفاء التبويب أكثر من دقيقة.
*/
export type Scale = 0 | 1 | 2 | 3 | 4;

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

const EMPTY: JournalData = { checkIns: {}, sessions: [] };

interface JournalState {
  unlocked: UnlockedVault | null;
  data: JournalData | null;
  /** تقييمات جلسات سُجّلت والمذكّرة مقفلة — تُحفظ عند الفتح التالي (في الذاكرة فقط) */
  pending: SessionRating[];
  create: (pin: string) => Promise<void>;
  unlockPin: (pin: string) => Promise<void>;
  unlockBio: () => Promise<void>;
  lock: () => void;
  saveCheckIn: (c: Omit<CheckIn, "updatedAt">) => Promise<void>;
  addSession: (s: SessionRating) => Promise<void>;
  wipe: () => void;
}

export const useJournal = create<JournalState>((set, get) => {
  const opened = async (u: UnlockedVault) => {
    const data = await vault.read<JournalData>(u, EMPTY);
    const { pending } = get();
    const merged = pending.length ? { ...data, sessions: [...data.sessions, ...pending] } : data;
    if (pending.length) await vault.write(u, merged);
    set({ unlocked: u, data: merged, pending: [] });
  };
  const persist = async (data: JournalData) => {
    const u = get().unlocked;
    if (!u) return;
    await vault.write(u, data);
    set({ data });
  };
  return {
    unlocked: null,
    data: null,
    pending: [],
    create: async (pin) => opened(await vault.create(pin, EMPTY)),
    unlockPin: async (pin) => opened(await vault.unlockWithPin(pin)),
    unlockBio: async () => opened(await vault.unlockWithBiometric()),
    lock: () => {
      get().unlocked?.raw.fill(0);
      set({ unlocked: null, data: null });
    },
    saveCheckIn: async (c) => {
      const data = get().data;
      if (!data) return;
      await persist({ ...data, checkIns: { ...data.checkIns, [c.day]: { ...c, updatedAt: new Date().toISOString() } } });
    },
    addSession: async (s) => {
      const data = get().data;
      if (!data) {
        set({ pending: [...get().pending, s] });
        return;
      }
      await persist({ ...data, sessions: [...data.sessions, s] });
    },
    wipe: () => {
      vault.destroy();
      set({ unlocked: null, data: null, pending: [] });
    },
  };
});

// القفل التلقائي
if (typeof window !== "undefined") {
  let idle: ReturnType<typeof setTimeout> | undefined;
  let hidden: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(idle);
    if (useJournal.getState().unlocked) idle = setTimeout(() => useJournal.getState().lock(), 5 * 60_000);
  };
  ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, arm, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    clearTimeout(hidden);
    if (document.hidden) hidden = setTimeout(() => useJournal.getState().lock(), 60_000);
  });
  useJournal.subscribe((s, prev) => {
    if (s.unlocked && !prev.unlocked) arm();
  });
}
