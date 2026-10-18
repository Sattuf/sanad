import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../core";
import { bookingApi, canSubmitBooking, directoryApi, groupSlotsByDay, isCancellable, isChatOpen } from "../directory";

function setup() {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  const client = createApiClient({
    baseUrl: "https://api.test",
    session: { getAccessToken: () => "tok", getRefreshToken: () => null, setTokens: () => {}, clear: () => {} },
    fetch,
  });
  return { client, fetch };
}

describe("الدليل والحجز", () => {
  it("بحث الدليل عام ويرسل عوامل التصفية المختارة فقط", async () => {
    const { client, fetch } = setup();
    await directoryApi(client.api).search({ q: " رقية ", practitionerType: "ReligiousPractitioner", track: null }, 2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.test/api/v1/directory?page=2&pageSize=12&q=%D8%B1%D9%82%D9%8A%D8%A9&practitionerType=ReligiousPractitioner");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("الحجز يحمل مفتاح Idempotency", async () => {
    const { client, fetch } = setup();
    await bookingApi(client.api).create({ serviceOfferingId: "o", availabilitySlotId: "s", beneficiaryNote: null, consentToSensitiveNoteProcessing: false }, "key-1");
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("key-1");
  });

  it("الملاحظة تتطلب موافقة، وبدونها يكفي الاختيار", () => {
    expect(canSubmitBooking("o", "s", "", false)).toBe(true);
    expect(canSubmitBooking("o", "s", "عندي قلق", false)).toBe(false);
    expect(canSubmitBooking("o", "s", "عندي قلق", true)).toBe(true);
    expect(canSubmitBooking("o", "", "", false)).toBe(false);
  });

  it("الأفعال بحسب الحالة", () => {
    expect(isCancellable("Accepted")).toBe(true);
    expect(isCancellable("Rejected")).toBe(false);
    expect(isChatOpen("Submitted")).toBe(false);
    expect(isChatOpen("Accepted")).toBe(true);
  });

  it("تجميع الفترات حسب اليوم بالترتيب", () => {
    const slots = [
      { id: "b", startUtc: "2026-10-02T10:00:00Z", endUtc: "", status: "Open" },
      { id: "a", startUtc: "2026-10-01T09:00:00Z", endUtc: "", status: "Open" },
      { id: "c", startUtc: "2026-10-01T11:00:00Z", endUtc: "", status: "Open" },
    ];
    const grouped = groupSlotsByDay(slots, (iso) => iso.slice(0, 10));
    expect(grouped.map(([d, l]) => [d, l.map((s) => s.id)])).toEqual([["2026-10-01", ["a", "c"]], ["2026-10-02", ["b"]]]);
  });
});
