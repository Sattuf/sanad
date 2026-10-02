import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ posts: [] as { path: string; body: unknown }[] }));

const plan = {
  id: "p1", key: "plan-x", version: 1, title: "تحصين الصباح", summary: "ملخص", contents: "محتوى", authorId: "a1", authorName: "الشيخ",
  authorHasConsent: true, durationDays: 7, minutesPerDay: 10, status: "InReview", isMine: false, canReview: true, reviewNote: null,
  withdrawReason: null, publishedAtUtc: null, safetyCheckedAtUtc: null, createdAtUtc: "2026-10-01T00:00:00Z",
  days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, items: [{ kind: "Quran", quranKey: "kursi", title: "آية الكرسي", repeat: 3 }] })),
};

vi.mock("../../../api/hooks", () => ({ useMe: () => ({ data: { roles: ["ContentManager"] } }) }));
vi.mock("../../../api/client", () => ({
  ApiError: class extends Error {},
  api: {
    get: async (path: string) => (path.includes("/authors") ? [{ id: "a1", displayName: "الشيخ", bio: "نبذة", hasConsent: true, consentRef: "1", consentDate: "2026-09-01", publishedPlans: 0, createdAtUtc: "" }] : [plan]),
    post: async (path: string, body: unknown) => {
      calls.posts.push({ path, body });
      return {};
    },
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { CompanionPlansAdminPage } from "../CompanionAdmin";
import { daysFromPatterns, patternsFromDays } from "../companionPlanDays";

beforeEach(() => {
  calls.posts = [];
});

describe("إدارة خطط سند", () => {
  it("لا يتاح النشر قبل إقرار كل بنود فحص الأمان، ثم يُرسل الإقرار كاملاً", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CompanionPlansAdminPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "راجعها" }));
    const publish = screen.getByRole("button", { name: "راجعتها — انشر" });
    expect(publish).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(8);
    boxes.slice(0, 7).forEach((b) => fireEvent.click(b));
    expect(publish).toBeDisabled();
    fireEvent.click(boxes[7]);
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    await waitFor(() => expect(calls.posts).toHaveLength(1));
    const body = calls.posts[0].body as { action: string; safety: Record<string, boolean> };
    expect(calls.posts[0].path).toBe("/api/v1/admin/companion/plans/p1/review");
    expect(body.action).toBe("Approve");
    expect(Object.values(body.safety)).toEqual(Array(8).fill(true));
  });

  it("أنماط الأيام تولّد أيام الخطة وتُستنتج منها بالعكس", () => {
    const a = [{ kind: "Quran" as const, quranKey: "fatiha", title: "الفاتحة", repeat: 1 }];
    const b = [{ kind: "Quran" as const, quranKey: "kursi", title: "آية الكرسي", repeat: 3 }];
    const days = daysFromPatterns([a, b], 14);
    expect(days).toHaveLength(14);
    expect(days[2].items[0].quranKey).toBe("fatiha");
    expect(days[3].items[0].quranKey).toBe("kursi");
    expect(patternsFromDays(days)).toHaveLength(2);
  });
});
