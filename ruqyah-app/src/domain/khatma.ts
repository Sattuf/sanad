/*
  الختمة الفردية — product-spec.md §2 و§3. ثلاثون جزءاً، والنقر على البتلة يسجّل الجزء أو يلغيه.
  الختمة الجماعية تحتاج خادماً للمزامنة والدعوات، وتأتي في المرحلة التالية؛ النموذج هنا يتسع لها.
*/
export const JUZ_COUNT = 30;

export interface Juz {
  index: number;
  assigneeId?: string;
  doneAt?: string;
}

export interface Khatma {
  id: string;
  mode: "solo" | "group";
  title: string;
  intention?: string;
  ownerId: string;
  members: { id: string; displayName: string }[];
  juz: Juz[];
  targetDate?: string;
  completedAt?: string;
  inviteCode?: string;
  /** الختمة الفردية المزامَنة في الحساب (إن دخل المستخدم). */
  remoteId?: string;
  /** أجزاء أُلغيت قراءتها على هذا الجهاز ولم يُبلَّغ الخادم بعد. */
  pendingUndo?: number[];
  /** بدأ ختمة جديدة على هذا الجهاز بعد إتمام السابقة، ولم يُبلَّغ الخادم بعد. */
  pendingNewRound?: boolean;
}

export const ME = "me";

export function newSoloKhatma(now = new Date()): Khatma {
  return {
    id: `solo-${now.getTime()}`,
    mode: "solo",
    title: "ختمتي",
    ownerId: ME,
    members: [{ id: ME, displayName: "أنت" }],
    juz: Array.from({ length: JUZ_COUNT }, (_, i) => ({ index: i + 1, assigneeId: ME })),
  };
}

export const doneCount = (k: Khatma) => k.juz.filter((j) => j.doneAt).length;
export const isComplete = (k: Khatma) => doneCount(k) === JUZ_COUNT;

export function toggleJuz(k: Khatma, index: number, now = new Date()): Khatma {
  const juz = k.juz.map((j) => (j.index === index ? { ...j, doneAt: j.doneAt ? undefined : now.toISOString() } : j));
  const next = { ...k, juz };
  return { ...next, completedAt: isComplete(next) ? (k.completedAt ?? now.toISOString()) : undefined };
}

/** كم جزءاً يومياً للوصول إلى التاريخ المستهدف، مقرّباً لأقرب نصف جزء. */
export function dailyPace(k: Khatma, now = new Date()): number | null {
  if (!k.targetDate) return null;
  const left = JUZ_COUNT - doneCount(k);
  const daysLeft = Math.max(1, Math.ceil((new Date(k.targetDate).getTime() - now.getTime()) / 86_400_000));
  return Math.max(0.5, Math.ceil((left / daysLeft) * 2) / 2);
}

/** «بجزء ونصف يومياً تختم في نحو…» — الأيام المتبقية بوتيرة ثابتة. */
export const daysAtPace = (k: Khatma, perDay = 1.5) => Math.ceil((JUZ_COUNT - doneCount(k)) / perDay);
