import { useSyncExternalStore } from "react";
import { authApi, completedTokens } from "@sanad/shared/api/auth";
import type { MyProfile } from "@sanad/shared/api/types";
import { api, hasApi, isSignedIn, onSessionChange, session } from "../api/client";
import { companionApi, type ServerEnrollment, type ServerReminder } from "../api/companion";
import { refreshCatalog } from "../content/catalog";
import { findPlan } from "../content/plans";
import { mergeDays, type Enrollment, type Reminder } from "../domain/enrollment";
import { actions, getState, subscribe } from "./store";

/*
  الحساب اختياري: التطبيق كامل دونه. الدخول يتيح شيئين فقط: مزامنة الخطة بين الأجهزة، والختمة الجماعية.
  المزامنة محلية أولاً: الجهاز مصدر الحقيقة لما قرأ عليه، والخادم يدمج (اتحاد الأيام) ولا يحذف يوماً.
  أي فشل شبكة يُترك بصمت ويُعاد في المزامنة التالية.
*/

const auth = authApi(api);
let profile: Pick<MyProfile, "displayName"> | null = null;
const listeners = new Set<() => void>();
let snapshot = { signedIn: isSignedIn(), displayName: null as string | null };
const emit = () => {
  snapshot = { signedIn: isSignedIn(), displayName: profile?.displayName ?? null };
  listeners.forEach((l) => l());
};
onSessionChange(emit);

export function useAccount() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      // الجلسة قد تتغير من خارج هذا الملف (تجديد فاشل يمسحها): يُعاد حساب اللقطة إن اختلفت فقط
      if (snapshot.signedIn !== isSignedIn()) snapshot = { signedIn: isSignedIn(), displayName: profile?.displayName ?? null };
      return snapshot;
    },
  );
}

export class SignInNeedsWebError extends Error {}

async function afterSignIn() {
  try {
    profile = await api.get<MyProfile>("/api/v1/me");
  } catch {
    profile = null;
  }
  emit();
  await syncEnrollment();
}

export async function signIn(email: string, password: string) {
  const res = await auth.loginEmail(email, password);
  const tokens = completedTokens(res);
  // حسابات الإدارة (تحقق ثنائي) تُكمل دخولها من موقع سند لا من هنا
  if (!tokens) throw new SignInNeedsWebError("أكمل الدخول لهذا الحساب من موقع سند.");
  session.setTokens(tokens.access, tokens.refresh);
  await afterSignIn();
}

export async function register(email: string, password: string, displayName: string) {
  const res = await auth.registerEmail({ email, password, displayName, acceptTerms: true, acceptPrivacyPolicy: true });
  const tokens = completedTokens(res);
  if (!tokens) throw new SignInNeedsWebError("أكمل إنشاء الحساب من موقع سند.");
  session.setTokens(tokens.access, tokens.refresh);
  await afterSignIn();
}

export async function signOut() {
  try {
    await auth.revoke(session.getRefreshToken());
  } catch {
    /* الخروج محلياً يكفي */
  }
  session.clear();
  profile = null;
  emit();
}

/** يعيد تحميل الاسم إن كانت الجلسة محفوظة من قبل (sessionStorage). */
export async function restoreSession() {
  if (!hasApi || !isSignedIn()) return;
  await afterSignIn();
}

// ── مزامنة الخطة ─────────────────────────────────────────────────────────────

const toServer: Record<Reminder, ServerReminder> = { after_fajr: "AfterFajr", after_maghrib: "AfterMaghrib", before_sleep: "BeforeSleep" };
const fromServer: Record<ServerReminder, Reminder> = { AfterFajr: "after_fajr", AfterMaghrib: "after_maghrib", BeforeSleep: "before_sleep" };

const adopt = (r: ServerEnrollment): Enrollment => ({
  planId: r.planId,
  planVersion: r.planVersion,
  startedAt: r.startedAtUtc,
  completedDays: r.completedDays,
  lastCompletedOn: r.lastCompletedOn ?? undefined,
  reminder: r.reminder ? fromServer[r.reminder] : undefined,
  remoteId: r.id,
});

let syncing: Promise<void> | null = null;

export function syncEnrollment(): Promise<void> {
  if (!hasApi || !isSignedIn()) return Promise.resolve();
  syncing ??= reconcile()
    .then(reconcileKhatma)
    .finally(() => (syncing = null));
  return syncing;
}

// ── مزامنة الختمة الفردية ─────────────────────────────────────────────────────
// الأجزاء المقروءة اتحاد بين الأجهزة؛ الإلغاء والختمة الجديدة يُبلَّغان صراحة. لا يُرسل شيء عن نيّة ولا عن حال.

async function reconcileKhatma() {
  try {
    let k = getState().khatma;
    const all = await companionApi.khatmas();
    let remote = all.find((x) => x.mode === "Solo" && x.isOwner && x.id === k.remoteId) ?? all.find((x) => x.mode === "Solo" && x.isOwner);
    if (!remote) {
      // لا يُنشأ في الحساب شيء قبل أن يُقرأ جزء
      if (!k.juz.some((j) => j.doneAt)) return;
      remote = await companionApi.createKhatma({ mode: "Solo", title: "ختمتي", intention: null, targetDate: null, displayName: "أنا" });
    }

    if (k.pendingNewRound && remote.doneCount === 30) remote = await companionApi.act(remote.id, "NewRound");
    const undo = (k.pendingUndo ?? []).filter((i) => remote!.juz.find((j) => j.index === i)?.done);
    if (undo.length) remote = await companionApi.act(remote.id, "MarkUndone", undo);

    const localDone = new Set(k.juz.filter((j) => j.doneAt).map((j) => j.index));
    const remoteDone = new Set(remote.juz.filter((j) => j.done).map((j) => j.index));
    const push = [...localDone].filter((i) => !remoteDone.has(i));
    if (push.length) remote = await companionApi.act(remote.id, "MarkDone", push);

    // ما قُرئ على جهاز آخر يظهر هنا
    k = getState().khatma;
    const now = new Date().toISOString();
    const done = new Set(remote.juz.filter((j) => j.done).map((j) => j.index));
    const juz = k.juz.map((j) => (done.has(j.index) ? { ...j, doneAt: j.doneAt ?? now } : { ...j, doneAt: undefined }));
    actions.syncKhatma({ ...k, juz, remoteId: remote.id, pendingUndo: [], pendingNewRound: false, completedAt: done.size === 30 ? (k.completedAt ?? now) : undefined });
  } catch {
    /* يُعاد في المزامنة التالية */
  }
}

async function reconcile() {
  try {
    const s = getState();
    if (s.pendingStopId) {
      await companionApi.stop();
      actions.clearPendingStop();
    }

    const local = getState().enrollment;
    const remote = (await companionApi.enrollment()).enrollment;
    const localPlan = findPlan(local?.planId);
    const syncable = Boolean(local && localPlan?.remote);

    if (!local || !syncable) {
      // جهاز جديد بلا خطة: يتبنّى خطة الحساب. خطة مضمَّنة في التطبيق تبقى على الجهاز ولا تُزامَن.
      if (!local && remote) {
        await refreshCatalog(remote.planId);
        if (findPlan(remote.planId)) actions.syncEnrollment(adopt(remote));
      }
      return;
    }

    const e = local!;
    if (remote && (remote.id === e.remoteId || remote.planId === e.planId)) {
      const r = await companionApi.progress(remote.id, e.completedDays, e.lastCompletedOn ?? null);
      actions.syncEnrollment({ ...mergeDays(e, r.completedDays, r.lastCompletedOn), remoteId: r.id });
      return;
    }
    if (remote && new Date(remote.startedAtUtc) > new Date(e.startedAt)) {
      // بدأ خطة أحدث من جهاز آخر
      await refreshCatalog(remote.planId);
      if (findPlan(remote.planId)) actions.syncEnrollment(adopt(remote));
      return;
    }
    const r = await companionApi.start(e.planId, e.reminder ? toServer[e.reminder] : null, e.completedDays, e.lastCompletedOn ?? null);
    actions.syncEnrollment({ ...mergeDays(e, r.completedDays, r.lastCompletedOn), remoteId: r.id });
  } catch {
    /* يُعاد في المزامنة التالية */
  }
}

// كل تغيير في الخطة (بدء، إتمام ورد، إيقاف) يُزامَن بعد لحظة — دون انتظار ودون إزعاج
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSeen = getState().enrollment;
let lastStop = getState().pendingStopId;
let lastKhatma = getState().khatma;
subscribe(() => {
  const s = getState();
  const changed = s.enrollment !== lastSeen || s.pendingStopId !== lastStop || s.khatma !== lastKhatma;
  lastSeen = s.enrollment;
  lastStop = s.pendingStopId;
  lastKhatma = s.khatma;
  if (!changed || syncing) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncEnrollment(), 800);
});
