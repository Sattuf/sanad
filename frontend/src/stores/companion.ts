import { create } from "zustand";
import { programById, type ProgramDay } from "../content/programs";
import { daysBetween, localDay } from "../lib/dates";
import { readJson, writeJson } from "../lib/safeStorage";

/*
  تقدّم برامج الالتزام — محلي على الجهاز فقط (docs/adr/0016)، بلا حساب ولا خادم.
  فلسفة التقدّم: لا «سلسلة» تنكسر ولا لوم. الأيام الفائتة تبقى مفتوحة، ونحتفي بـ«أيام الالتزام» لا بالكمال.
*/
interface Persisted {
  activeProgramId: string | null;
  startedOn: string | null;
  /** مفتاح `${programId}:${day}:${taskId}` */
  done: Record<string, true>;
  /** أيام (تاريخ محلي) أُنجزت فيها مهمة واحدة على الأقل */
  activeDays: Record<string, true>;
  finished: string[];
  quiz: { score: number; programId: string; at: string } | null;
}

interface CompanionState extends Persisted {
  start: (programId: string) => void;
  leave: () => void;
  toggle: (day: number, taskId: string) => void;
  finish: () => void;
  saveQuiz: (q: { score: number; programId: string }) => void;
}

const KEY = "sanad.companion.v1";
const EMPTY: Persisted = { activeProgramId: null, startedOn: null, done: {}, activeDays: {}, finished: [], quiz: null };

export const useCompanion = create<CompanionState>((set, get) => ({
  ...EMPTY,
  ...readJson<Partial<Persisted>>(KEY, {}),
  start: (programId) => set({ activeProgramId: programId, startedOn: localDay() }),
  leave: () => set({ activeProgramId: null, startedOn: null }),
  toggle: (day, taskId) => {
    const { activeProgramId, done, activeDays } = get();
    if (!activeProgramId) return;
    const key = `${activeProgramId}:${day}:${taskId}`;
    const next = { ...done };
    if (next[key]) delete next[key];
    else next[key] = true;
    set({ done: next, activeDays: next[key] ? { ...activeDays, [localDay()]: true } : activeDays });
  },
  finish: () => {
    const { activeProgramId, finished } = get();
    if (!activeProgramId) return;
    set({ finished: [...new Set([...finished, activeProgramId])], activeProgramId: null, startedOn: null });
  },
  saveQuiz: (q) => set({ quiz: { ...q, at: localDay() } }),
}));

useCompanion.subscribe((s) => {
  const { activeProgramId, startedOn, done, activeDays, finished, quiz } = s;
  writeJson(KEY, { activeProgramId, startedOn, done, activeDays, finished, quiz } satisfies Persisted);
});

/** اليوم الحالي في البرنامج حسب التقويم (يبدأ من 1، ولا يتجاوز طول البرنامج). */
export function currentDay(startedOn: string | null, length: number, today = localDay()): number {
  if (!startedOn) return 1;
  return Math.min(length, Math.max(1, daysBetween(startedOn, today) + 1));
}

export function dayProgress(programId: string, day: ProgramDay, done: Record<string, true>) {
  const total = day.tasks.length;
  const completed = day.tasks.filter((t) => done[`${programId}:${day.day}:${t.id}`]).length;
  return { total, completed, ratio: total ? completed / total : 0 };
}

export function programProgress(programId: string, done: Record<string, true>) {
  const p = programById(programId);
  if (!p) return { total: 0, completed: 0, ratio: 0, daysComplete: 0 };
  let total = 0;
  let completed = 0;
  let daysComplete = 0;
  for (const d of p.plan) {
    const r = dayProgress(p.id, d, done);
    total += r.total;
    completed += r.completed;
    if (r.total && r.completed === r.total) daysComplete++;
  }
  return { total, completed, ratio: total ? completed / total : 0, daysComplete };
}
