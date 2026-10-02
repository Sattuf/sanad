import * as Notifications from "expo-notifications";
import { applyReminders, loadReminders, safeNotificationPath } from "@/lib/reminders";

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  AndroidImportance: { DEFAULT: 3 },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
}));

beforeEach(() => jest.clearAllMocks());

it("يجدول الأوقات المفعّلة يومياً ويلغي الباقي، ويحفظها", async () => {
  await applyReminders({ morning: "06:30", evening: null, sleep: "22:15" });

  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    identifier: "sanad-adhkar-morning",
    content: { title: "أذكار الصباح", data: { url: "/ruqyah/morning-evening" } },
    trigger: { type: "daily", hour: 6, minute: 30 },
  });
  expect(calls[1].trigger).toMatchObject({ hour: 22, minute: 15 });
  await expect(loadReminders()).resolves.toEqual({ morning: "06:30", evening: null, sleep: "22:15" });
});

it("نص الإشعار عام بلا بيانات شخصية", async () => {
  await applyReminders({ morning: "06:30", evening: "17:30", sleep: "22:30" });
  for (const [req] of (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls) expect(req.content.body).toMatch(/^حان وقت أذكار/);
});

it("الإشعار لا يفتح إلا مساراً داخلياً", () => {
  expect(safeNotificationPath("/ruqyah/sleep")).toBe("/ruqyah/sleep");
  for (const bad of ["https://evil.test", "//evil.test", "javascript:alert(1)", 42, undefined]) expect(safeNotificationPath(bad)).toBe("/ruqyah");
});
