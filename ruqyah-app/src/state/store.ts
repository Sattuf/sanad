import { useSyncExternalStore } from "react";
import { findPlan } from "../content/plans";
import { completeDay, enroll, localDay, type Enrollment, type Reminder } from "../domain/enrollment";
import { newSoloKhatma, toggleJuz, type Khatma } from "../domain/khatma";
import { load, save } from "../lib/storage";

/*
  حالة سند كلها محلية. لا حساب ولا مزامنة في هذه المرحلة، ولا تحليلات.
  ما يُحفظ: الخطة الحالية وأيامها، الختمة، وإعدادات العرض. لا شيء عن حال المستخدم.
*/
export type Theme = "auto" | "light" | "dark";

export interface Settings {
  theme: Theme;
  /** تكبير نص القرآن: من ١ إلى ١٫٥ */
  quranScale: number;
  onboarded: boolean;
}

/** عدّادات القارئ لورد اليوم الجاري، حتى لا تضيع إن أُغلق التطبيق في منتصف الورد. */
export interface ReaderProgress {
  planId: string;
  day: number;
  date: string;
  counts: Record<string, number>;
}

export interface State {
  enrollment: Enrollment | null;
  khatma: Khatma;
  settings: Settings;
  reader: ReaderProgress | null;
  /** تذكير الدعم يظهر مرة واحدة لطيفة بعد إتمام أول خطة كاملة، ولا يتكرر. */
  supportNoteSeen: boolean;
  plansCompleted: number;
  /** تسجيل في الحساب أُوقف على هذا الجهاز ولم يُبلَّغ الخادم بعد (دون اتصال). */
  pendingStopId: string | null;
  /** مشاركة عدّادات مجهولة تماماً (بلا أي معرّف). */
  anonymousStats: boolean;
}

const initial = (): State => ({
  enrollment: load<Enrollment | null>("enrollment", null),
  khatma: load<Khatma>("khatma", newSoloKhatma()),
  settings: { theme: "auto", quranScale: 1, onboarded: false, ...load<Partial<Settings>>("settings", {}) },
  reader: load<ReaderProgress | null>("reader", null),
  supportNoteSeen: load("supportNoteSeen", false),
  plansCompleted: load("plansCompleted", 0),
  pendingStopId: load<string | null>("pendingStopId", null),
  anonymousStats: load("anonymousStats", true),
});

let state = initial();
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const [k, v] of Object.entries(patch)) save(k, v);
  listeners.forEach((l) => l());
}

export const getState = () => state;

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** للاختبارات: إعادة قراءة الحالة من التخزين. */
export function resetStore() {
  state = initial();
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export const actions = {
  startPlan(planId: string, reminder?: Reminder) {
    const plan = findPlan(planId);
    if (!plan) return;
    set({ enrollment: enroll(plan, new Date(), reminder ?? state.enrollment?.reminder), reader: null });
  },

  stopPlan() {
    const remoteId = state.enrollment?.remoteId ?? null;
    set({ enrollment: null, reader: null, pendingStopId: remoteId ?? state.pendingStopId });
  },

  /** من المزامنة: تسجيل معدَّل (دمج أيام، معرّف الحساب) أو متبنّى من جهاز آخر. */
  syncEnrollment(enrollment: Enrollment | null) {
    set({ enrollment });
  },

  clearPendingStop() {
    set({ pendingStopId: null });
  },

  setAnonymousStats(anonymousStats: boolean) {
    set({ anonymousStats });
  },

  setReminder(reminder: Reminder | undefined) {
    if (state.enrollment) set({ enrollment: { ...state.enrollment, reminder } });
  },

  /** يسجّل ورد اليوم مكتملاً، ويعيد true إن اكتملت الخطة كلها بذلك. */
  completeWird(): boolean {
    const e = state.enrollment;
    const plan = findPlan(e?.planId);
    if (!e || !plan) return false;
    const next = completeDay(e, plan);
    const finishedNow = next.completedDays.length >= plan.durationDays && e.completedDays.length < plan.durationDays;
    set({ enrollment: next, reader: null, ...(finishedNow ? { plansCompleted: state.plansCompleted + 1 } : {}) });
    return finishedNow;
  },

  setCount(planId: string, day: number, key: string, value: number) {
    const today = localDay();
    const r = state.reader;
    const base = r && r.planId === planId && r.day === day && r.date === today ? r.counts : {};
    set({ reader: { planId, day, date: today, counts: { ...base, [key]: value } } });
  },

  toggleJuz(index: number) {
    const k = state.khatma;
    const wasDone = Boolean(k.juz.find((j) => j.index === index)?.doneAt);
    const next = toggleJuz(k, index);
    // الإلغاء يُحفظ للمزامنة (الدمج اتحاد، فالإلغاء وحده يحتاج إبلاغاً صريحاً)
    const pending = new Set(k.pendingUndo ?? []);
    if (wasDone && k.remoteId) pending.add(index);
    else pending.delete(index);
    set({ khatma: { ...next, pendingUndo: [...pending] } });
  },

  /** من المزامنة: ختمة مدموجة مع الحساب. */
  syncKhatma(khatma: Khatma) {
    set({ khatma });
  },

  setKhatmaTarget(targetDate: string | undefined) {
    set({ khatma: { ...state.khatma, targetDate } });
  },

  newKhatma() {
    const remoteId = state.khatma.remoteId;
    set({ khatma: { ...newSoloKhatma(), remoteId, pendingNewRound: Boolean(remoteId) } });
  },

  updateSettings(patch: Partial<Settings>) {
    set({ settings: { ...state.settings, ...patch } });
  },

  markSupportNoteSeen() {
    set({ supportNoteSeen: true });
  },
};

/** عدّادات ورد اليوم إن كانت لليوم نفسه، وإلا فارغة. */
export function readerCounts(s: Pick<State, "reader">, planId: string, day: number): Record<string, number> {
  const r = s.reader;
  return r && r.planId === planId && r.day === day && r.date === localDay() ? r.counts : {};
}
