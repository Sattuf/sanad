import type { Plan } from "../content/plans";

/*
  التسجيل في خطة: لا يُخزَّن فيه أي شيء عن حال المستخدم (product-spec.md §3).
  الانقطاع لا يُعاقَب: لا عدّاد للأيام الفائتة، والمستخدم يكمل من حيث توقف.
*/
export type Reminder = "after_fajr" | "after_maghrib" | "before_sleep";

export interface Enrollment {
  planId: string;
  planVersion: number;
  startedAt: string;
  completedDays: number[];
  /** آخر يوم تقويمي (YYYY-MM-DD محلياً) أُتمّ فيه ورد. */
  lastCompletedOn?: string;
  reminder?: Reminder;
  /** معرّف التسجيل في الحساب حين تُزامَن الخطة (خطط الخادم المنشورة فقط). */
  remoteId?: string;
}

export const reminderLabels: Record<Reminder, string> = {
  after_fajr: "بعد الفجر",
  after_maghrib: "بعد المغرب",
  before_sleep: "قبل النوم",
};

export function localDay(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function enroll(plan: Plan, now = new Date(), reminder?: Reminder): Enrollment {
  return { planId: plan.id, planVersion: plan.version, startedAt: now.toISOString(), completedDays: [], reminder };
}

/** اليوم التالي في الخطة: أول يوم لم يكتمل. */
export function currentDay(e: Enrollment, plan: Plan) {
  for (let d = 1; d <= plan.durationDays; d++) if (!e.completedDays.includes(d)) return d;
  return plan.durationDays;
}

export const isFinished = (e: Enrollment, plan: Plan) => e.completedDays.length >= plan.durationDays;

/** هل أتمّ المستخدم ورد اليوم التقويمي الحالي؟ */
export const doneToday = (e: Enrollment, now = new Date()) => e.lastCompletedOn === localDay(now);

/**
 * هل انقطع؟ مرّ أكثر من يوم تقويمي على آخر ورد (أو على البدء دون ورد).
 * يُستعمل فقط لتغيير الصياغة إلى «أكمل من حيث توقفت»، ولا يُعرض عدد الأيام الفائتة أبداً.
 */
export function isResuming(e: Enrollment, now = new Date()) {
  const last = e.lastCompletedOn ? new Date(`${e.lastCompletedOn}T12:00:00`) : new Date(e.startedAt);
  const gap = (new Date(`${localDay(now)}T12:00:00`).getTime() - new Date(`${localDay(last)}T12:00:00`).getTime()) / 86_400_000;
  return e.completedDays.length > 0 ? gap > 1 : gap >= 1;
}

/** دمج أيام من جهاز آخر (اتحاد) — لا يضيع يوم ولا يُحذف. */
export function mergeDays(e: Enrollment, days: number[], lastCompletedOn?: string | null): Enrollment {
  const merged = [...new Set([...e.completedDays, ...days])].sort((a, b) => a - b);
  const last = [e.lastCompletedOn, lastCompletedOn ?? undefined].filter(Boolean).sort().pop();
  return { ...e, completedDays: merged, lastCompletedOn: last };
}

export function completeDay(e: Enrollment, plan: Plan, now = new Date()): Enrollment {
  if (isFinished(e, plan)) return e;
  const day = currentDay(e, plan);
  return { ...e, completedDays: [...e.completedDays, day].sort((a, b) => a - b), lastCompletedOn: localDay(now) };
}
