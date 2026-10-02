import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupKhatma } from "../api/companion";

const h = vi.hoisted(() => ({ signedIn: true, actCalls: [] as unknown[][], state: null as unknown as GroupKhatma }));

vi.mock("../api/client", () => ({
  hasApi: true, API_URL: "http://api.test", WEB_URL: "",
  isSignedIn: () => h.signedIn,
  onSessionChange: () => () => {}, onEmergency: () => () => {},
  session: { getRefreshToken: () => null, getAccessToken: () => null, setTokens: () => {}, clear: () => {} },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

vi.mock("../api/companion", () => ({
  companionApi: {
    khatma: async () => h.state,
    act: async (...args: unknown[]) => {
      h.actCalls.push(args);
      return h.state;
    },
    preview: async () => ({ title: "ختمة", memberCount: 2, doneCount: 0, alreadyMember: false, khatmaId: null }),
  },
}));

import { GroupKhatmaScreen, JoinKhatma } from "../screens/GroupKhatma";

const juz = (i: number) =>
  i <= 10 ? { index: i, memberKey: "me000000000000aa", isMine: true, done: i === 1 }
  : i <= 20 ? { index: i, memberKey: "other0000000000b", isMine: false, done: i === 11 }
  : { index: i, memberKey: null, isMine: false, done: false };

beforeEach(() => {
  localStorage.clear();
  h.signedIn = true;
  h.actCalls = [];
  h.state = {
    id: "k1", mode: "Group", title: "ختمة الأسرة", intention: "على نية شفاء الوالدة", isOwner: true, round: 1, targetDate: null,
    completedAtUtc: null, doneCount: 2, inviteCode: "ABCDEFGHJK", updatedAtUtc: null,
    members: [
      { memberKey: "me000000000000aa", displayName: "أم محمد", isMe: true, isOwner: true, assignedJuz: 10, doneJuz: 1 },
      { memberKey: "other0000000000b", displayName: "أحمد", isMe: false, isOwner: false, assignedJuz: 10, doneJuz: 1 },
    ],
    juz: Array.from({ length: 30 }, (_, i) => juz(i + 1)),
  };
});

describe("الختمة الجماعية", () => {
  it("بتلاتي ومتاحة قابلة للنقر، وبتلات غيري للعرض فقط", async () => {
    render(<GroupKhatmaScreen id="k1" />);
    const rosette = await screen.findByRole("group", { name: /أجزاء الختمة/ });
    expect(within(rosette).getByRole("button", { name: "الجزء ٢: لم يُقرأ" })).toBeInTheDocument();
    expect(within(rosette).getByRole("img", { name: "الجزء ١١: مقروء (أحمد)" })).toBeInTheDocument();
    expect(within(rosette).queryByRole("button", { name: /الجزء ١٢/ })).toBeNull();

    await act(async () => fireEvent.click(within(rosette).getByRole("button", { name: "الجزء ٢١: لم يُقرأ (متاح)" })));
    expect(h.actCalls[0]).toEqual(["k1", "MarkDone", [21], undefined]);
    await act(async () => fireEvent.click(within(rosette).getByRole("button", { name: "الجزء ١: مقروء" })));
    expect(h.actCalls[1]).toEqual(["k1", "MarkUndone", [1], undefined]);
  });

  it("رسالة الدعوة لا تحمل النيّة ولا أسماء الأعضاء", async () => {
    render(<GroupKhatmaScreen id="k1" />);
    const wa = await screen.findByRole("link", { name: "عبر واتساب" });
    const text = decodeURIComponent(wa.getAttribute("href")!);
    expect(text).toContain("ختمة الأسرة");
    expect(text).toContain("#/join/ABCDEFGHJK");
    expect(text).not.toContain("الوالدة");
    expect(text).not.toContain("أحمد");
  });

  it("الدعوة دون حساب تطلب الدخول وتعود إليها بعده", () => {
    h.signedIn = false;
    render(<JoinKhatma code="ABCDEFGHJK" />);
    expect(screen.getByRole("link", { name: "ادخل إلى حسابك" })).toBeInTheDocument();
    expect(localStorage.getItem("sanad:pendingJoin")).toBe('"ABCDEFGHJK"');
  });
});
