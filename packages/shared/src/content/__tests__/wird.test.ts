import { describe, expect, it } from "vitest";
import { collections } from "../ruqyah";
import { buildEntries, bumpCount, countCompleted, localDay, mergeCounts, parseTime, slotForHour, wirdPayload } from "../wird";

const sleep = collections.find((c) => c.id === "sleep")!;

describe("الورد", () => {
  it("يرتّب الأدعية المضافة بعد النصوص الثابتة بمفاتيح ثابتة", () => {
    const entries = buildEntries("sleep", sleep.items, [
      { id: "b", collectionId: "sleep", title: "ب", text: "ب", source: "مصدر", note: null, repeat: 1, sortOrder: 2 },
      { id: "a", collectionId: "sleep", title: "أ", text: "أ", source: "مصدر", note: null, repeat: 3, sortOrder: 1 },
      { id: "x", collectionId: "other", title: "x", text: "x", source: "x", note: null, repeat: 1, sortOrder: 0 },
    ]);
    expect(entries.slice(-2).map((e) => e.key)).toEqual(["d:a", "d:b"]);
    expect(entries).toHaveLength(sleep.items.length + 2);
  });

  it("الدمج يأخذ الأكبر ولا يضيّع تقدّم الجهاز", () => {
    expect(mergeCounts({ "0": 3, "1": 1 }, { "0": 1, "2": 5 })).toEqual({ "0": 3, "1": 1, "2": 5 });
    expect(mergeCounts({ "0": 2 }, undefined)).toEqual({ "0": 2 });
  });

  it("العدّاد لا يتجاوز التكرار، والإتمام يُحسب", () => {
    const entries = buildEntries("sleep", sleep.items);
    let counts = {};
    for (const e of entries) for (let i = 0; i < 50; i++) counts = bumpCount(counts, e);
    expect(countCompleted(entries, counts)).toBe(entries.length);
    expect(Object.values(counts).every((v) => (v as number) <= 100)).toBe(true);
    expect(wirdPayload("sleep", "2026-10-01", entries, counts)).toMatchObject({ completedItems: entries.length, totalItems: entries.length });
  });

  it("اليوم محلي، والأوقات بصيغة HH:mm فقط", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(parseTime("06:30")).toEqual({ hour: 6, minute: 30 });
    expect(parseTime("24:00")).toBeNull();
    expect(slotForHour(7)?.id).toBe("morning");
    expect(slotForHour(13)).toBeNull();
    expect(slotForHour(1)?.id).toBe("sleep");
  });
});
