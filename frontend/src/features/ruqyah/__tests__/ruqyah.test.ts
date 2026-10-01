import { describe, expect, it } from "vitest";
import { collections } from "@sanad/shared/content/ruqyah";
import { localDay } from "../progress";
import { buildIcs, dueWird } from "../reminders";

describe("reminders", () => {
  it("builds a daily calendar event per chosen slot with a link to the wird", () => {
    const ics = buildIcs({ morning: "06:30", sleep: "22:15" }, "https://sanad.example", new Date(2026, 8, 27, 10));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20260927T063000");
    expect(ics).toContain("DTSTART:20260927T221500");
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain("URL:https://sanad.example/ruqyah/sleep");
    expect(ics).not.toContain("UID:sanad-evening");
  });

  it("nudges only when a wird is due and not completed today", () => {
    localStorage.clear();
    expect(dueWird(7)?.collection).toBe("morning-evening");
    expect(dueWird(13)).toBeNull();
    expect(dueWird(23)?.collection).toBe("sleep");
    const sleep = collections.find((c) => c.id === "sleep")!;
    localStorage.setItem(`sanad.ruqyah.progress.sleep.${localDay()}`, JSON.stringify(Object.fromEntries(sleep.items.map((it, i) => [String(i), it.repeat ?? 1]))));
    expect(dueWird(23)).toBeNull();
  });
});
