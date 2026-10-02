import { useSyncExternalStore } from "react";
import { ApiError } from "@sanad/shared/api/core";
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

export const isNetworkError = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500);

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
  syncing ??= reconcile().finally(() => (syncing = null));
  return syncing;
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
      // جهاز جديد بلا خطة: يتبنّى خطة الحساب. خطة تجريبية محلية تبقى كما هي ولا تُزامَن.
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
subscribe(() => {
  const s = getState();
  const changed = s.enrollment !== lastSeen || s.pendingStopId !== lastStop;
  lastSeen = s.enrollment;
  lastStop = s.pendingStopId;
  if (!changed || syncing) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncEnrollment(), 800);
});
