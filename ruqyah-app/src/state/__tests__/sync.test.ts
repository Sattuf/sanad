import { beforeEach, describe, expect, it, vi } from "vitest";

// خادم مزيّف: الحساب مسجَّل الدخول، والخادم يدمج الأيام كما يفعل PlanEnrollment.RecordCompletedDays
const server = vi.hoisted(() => ({
  enrollment: null as null | Record<string, unknown>,
  calls: [] as string[],
  plan: {
    id: "p1", title: "خطة منشورة", summary: "ملخص", contents: "محتوى", durationDays: 7 as const, minutesPerDay: 5, version: 1,
    publishedAtUtc: null, safetyCheckedAtUtc: null, isCurrent: true,
    author: { id: "a", displayName: "معدّ", bio: "نبذة", consentDate: "2026-01-01" },
    days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, items: [{ kind: "Quran", quranKey: "ikhlas", title: "الإخلاص", repeat: 3 }] })),
  },
}));

vi.mock("../../api/client", () => ({
  hasApi: true,
  API_URL: "http://api.test",
  WEB_URL: "",
  isSignedIn: () => true,
  onSessionChange: () => () => {},
  onEmergency: () => () => {},
  session: { getRefreshToken: () => "r", getAccessToken: () => "a", setTokens: () => {}, clear: () => {} },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

vi.mock("../../api/companion", () => ({
  companionApi: {
    plans: async () => [server.plan],
    plan: async () => server.plan,
    enrollment: async () => ({ enrollment: server.enrollment }),
    start: async (planId: string, _r: unknown, completedDays: number[]) => {
      server.calls.push(`start:${planId}:${completedDays.join(",")}`);
      server.enrollment = { id: "e1", planId, planVersion: 1, startedAtUtc: new Date().toISOString(), completedDays, lastCompletedOn: null, reminder: null };
      return server.enrollment;
    },
    progress: async (id: string, completedDays: number[]) => {
      server.calls.push(`progress:${id}:${completedDays.join(",")}`);
      const merged = [...new Set([...(server.enrollment!.completedDays as number[]), ...completedDays])].sort((a, b) => a - b);
      server.enrollment = { ...server.enrollment!, completedDays: merged };
      return server.enrollment;
    },
    stop: async () => {
      server.calls.push("stop");
      server.enrollment = null;
    },
  },
}));

import { fromServerPlan, setRemotePlans } from "../../content/plans";
import { syncEnrollment } from "../account";
import { actions, getState, resetStore } from "../store";

const plan = fromServerPlan(server.plan)!;

beforeEach(() => {
  localStorage.clear();
  resetStore();
  server.enrollment = null;
  server.calls = [];
  setRemotePlans([plan]);
});

describe("مزامنة الخطة", () => {
  it("خطة بدأها على الجهاز تُربط بالحساب ومعها أيامها", async () => {
    actions.startPlan("p1");
    actions.completeWird();
    await syncEnrollment();
    expect(server.calls).toEqual(["start:p1:1"]);
    expect(getState().enrollment?.remoteId).toBe("e1");
  });

  it("الأيام من جهازين تُدمج ولا يضيع يوم", async () => {
    actions.startPlan("p1");
    actions.completeWird();
    await syncEnrollment();
    server.enrollment = { ...server.enrollment!, completedDays: [1, 2, 3] }; // جهاز آخر
    await syncEnrollment();
    expect(getState().enrollment?.completedDays).toEqual([1, 2, 3]);
  });

  it("جهاز جديد بلا خطة يتبنّى خطة الحساب، والإيقاف يُبلَّغ للخادم", async () => {
    setRemotePlans([]); // الجهاز الجديد لم يجلب الكتالوج بعد
    server.enrollment = { id: "e9", planId: "p1", planVersion: 1, startedAtUtc: new Date().toISOString(), completedDays: [1, 2], lastCompletedOn: null, reminder: "AfterFajr" };
    await syncEnrollment();
    expect(getState().enrollment).toMatchObject({ planId: "p1", completedDays: [1, 2], reminder: "after_fajr", remoteId: "e9" });

    actions.stopPlan();
    expect(getState().pendingStopId).toBe("e9");
    await syncEnrollment();
    expect(server.calls).toContain("stop");
    expect(getState().pendingStopId).toBeNull();
  });

  it("الخطة التجريبية المحلية لا تُرسل للخادم", async () => {
    setRemotePlans([]);
    actions.startPlan("morning-evening-7");
    await syncEnrollment();
    expect(server.calls).toEqual([]);
  });
});
