import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime, formatTime } from "@sanad/shared/lib/format";
import { fakeServer, renderRoute, signIn, signOutLocally } from "../../../test/harness";
import { BookPage } from "../BookPage";
import { BookingDetailPage, MyBookingsPage } from "../BookingPages";

const provider = {
  id: "p1", displayName: "الشيخ عبدالله", declaredTitle: "راقٍ شرعي", practitionerType: "ReligiousPractitioner", track: "WaqfFree",
  practiceScope: "الرقية بالقرآن", languages: ["العربية"], deliveryMode: "Remote", city: "الرياض", professionalBoundariesNote: "",
  organizationId: null, organizationName: null, verification: { status: "Approved", lastCheckedAtUtc: null, expiresAtUtc: null, isConditional: false },
  offerings: [{ id: "off1", category: "رقية", description: "جلسة", cancellationPolicy: "قبل يوم", explicitExclusions: [], sessionDurationMinutes: 45 }],
};
const s1 = { id: "s1", startUtc: "2026-10-20T07:00:00Z", endUtc: "2026-10-20T07:45:00Z", status: "Open" };
const s2 = { id: "s2", startUtc: "2026-10-20T08:00:00Z", endUtc: "2026-10-20T08:45:00Z", status: "Open" };

const booking = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "b1", status, slotStartUtc: s1.startUtc, slotEndUtc: s1.endUtc, providerProfileId: "p1", providerDisplayName: "الشيخ عبدالله",
  serviceCategory: "رقية", counterpartDisplayName: null, administrativeReasonForRejection: null, conversationId: null, ...extra,
});
const me = { id: "u1", displayName: "سالم", roles: ["Beneficiary"], providerProfileId: null, activeConsents: ["TermsOfService", "PrivacyPolicy"] };

beforeEach(() => signIn());
afterEach(() => {
  signOutLocally();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("حجز موعد", () => {
  it("لا يُرسَل قبل الخدمة والموعد، والملاحظة تطلب موافقة صريحة، ثم يُرسل بمفتاح تكرار وينتقل للحجز", async () => {
    const server = fakeServer({
      "GET /api/v1/providers/p1": provider,
      "GET /api/v1/providers/p1/availability": [s1, s2],
      "POST /api/v1/bookings": { id: "b1", status: "Submitted", slotStartUtc: s1.startUtc, slotEndUtc: s1.endUtc },
    });
    renderRoute("/book/p1?offering=off1", "/book/:providerId", <BookPage />);

    const submit = await screen.findByRole("button", { name: "إرسال طلب الحجز" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: formatTime(s1.startUtc) }));
    expect(screen.getByRole("radio", { name: formatTime(s1.startUtc) })).toHaveAttribute("aria-checked", "true");
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText("ملاحظتك للمختص (اختيارية)"), { target: { value: "  أعاني من الأرق.  " } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/bookings/b1"));
    const [post] = server.to("POST /api/v1/bookings");
    expect(post.body).toEqual({ serviceOfferingId: "off1", availabilitySlotId: "s1", beneficiaryNote: "أعاني من الأرق.", consentToSensitiveNoteProcessing: true });
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.headers.get("Authorization")).toBe("Bearer access-1");
  });

  it("موعد أُخذ (409): رسالة الخادم، وتحديث المواعيد، ومفتاح جديد للمحاولة التالية", async () => {
    let slots = [s1, s2];
    let attempts = 0;
    const server = fakeServer({
      "GET /api/v1/providers/p1": provider,
      "GET /api/v1/providers/p1/availability": () => slots,
      "POST /api/v1/bookings": () => {
        attempts += 1;
        if (attempts === 1) {
          slots = [s2];
          return { status: 409, body: { title: "هذا الموعد لم يعد متاحاً." } };
        }
        return { id: "b1", status: "Submitted", slotStartUtc: s2.startUtc, slotEndUtc: s2.endUtc };
      },
    });
    renderRoute("/book/p1?offering=off1", "/book/:providerId", <BookPage />);

    fireEvent.click(await screen.findByRole("radio", { name: formatTime(s1.startUtc) }));
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الحجز" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("هذا الموعد لم يعد متاحاً.");
    await waitFor(() => expect(screen.queryByRole("radio", { name: formatTime(s1.startUtc) })).toBeNull());

    fireEvent.click(screen.getByRole("radio", { name: formatTime(s2.startUtc) }));
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الحجز" }));
    await waitFor(() => expect(server.to("POST /api/v1/bookings")).toHaveLength(2));
    const [k1, k2] = server.to("POST /api/v1/bookings").map((c) => c.headers.get("Idempotency-Key"));
    expect(k1).not.toBe(k2);
  });
});

describe("حجوزاتي وتفاصيل الحجز", () => {
  it("قائمة الحجوزات بحالتها وموعدها", async () => {
    fakeServer({ "GET /api/v1/me/bookings": [booking("Accepted")] });
    renderRoute("/bookings", "/bookings", <MyBookingsPage />);
    const row = (await screen.findByText("الشيخ عبدالله")).closest("a")!;
    expect(within(row).getByText("مؤكَّد")).toBeInTheDocument();
    expect(row).toHaveTextContent(formatDateTime(s1.startUtc));
    expect(row).toHaveAttribute("href", "/bookings/b1");
  });

  it("موعد بديل: قبوله يُرسل، والإلغاء لا يُرسل إلا بعد التأكيد، والمحادثة تُفتح", async () => {
    let status = "AlternativeProposed";
    const server = fakeServer({
      "GET /api/v1/me": me,
      "GET /api/v1/bookings/b1": () => booking(status),
      "GET /api/v1/bookings/b1/note": { bookingId: "b1", note: "<b>ملاحظتي</b>" },
      "POST /api/v1/bookings/b1/accept": () => {
        status = "Accepted";
        return { status: 204 };
      },
      "POST /api/v1/bookings/b1/cancel": { status: 204 },
      "POST /api/v1/bookings/b1/conversation": { id: "c1", bookingRequestId: "b1", status: "Active", lastMessageAtUtc: null, counterpartDisplayName: "الشيخ" },
    });
    renderRoute("/bookings/b1", "/bookings/:id", <BookingDetailPage />);

    expect(await screen.findByText("اقترح المختص موعداً بديلاً")).toBeInTheDocument();
    // الملاحظة نص حرفي لا HTML
    expect(await screen.findByText("<b>ملاحظتي</b>")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "قبول الموعد البديل" }));
    await waitFor(() => expect(server.to("POST /api/v1/bookings/b1/accept")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "قبول الموعد البديل" })).toBeNull());
    expect(screen.getByText("مؤكَّد")).toBeInTheDocument();

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الحجز" }));
    expect(server.to("POST /api/v1/bookings/b1/cancel")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الحجز" }));
    await waitFor(() => expect(server.to("POST /api/v1/bookings/b1/cancel")).toHaveLength(1));
    expect(confirm).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "المحادثة الإدارية" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/conversations/c1"));
  });

  it("الرفض الإداري يظهر سببه، ولا أفعال على حجز مرفوض", async () => {
    fakeServer({
      "GET /api/v1/me": me,
      "GET /api/v1/bookings/b1": booking("Rejected", { administrativeReasonForRejection: "خارج نطاق الخدمة" }),
      "GET /api/v1/bookings/b1/note": { bookingId: "b1", note: null },
    });
    renderRoute("/bookings/b1", "/bookings/:id", <BookingDetailPage />);
    expect(await screen.findByText("السبب الإداري: خارج نطاق الخدمة")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إلغاء الحجز" })).toBeNull();
    expect(screen.queryByRole("button", { name: "المحادثة الإدارية" })).toBeNull();
    expect(await screen.findByText("لم تكتب ملاحظة.")).toBeInTheDocument();
  });

  it("خطأ الخادم يظهر برسالته الودّية", async () => {
    fakeServer({
      "GET /api/v1/me": me,
      "GET /api/v1/bookings/b1": booking("Accepted"),
      "GET /api/v1/bookings/b1/note": { bookingId: "b1", note: null },
      "POST /api/v1/bookings/b1/cancel": { status: 409, body: { title: "لا يمكن الإلغاء بعد بدء الموعد." } },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoute("/bookings/b1", "/bookings/:id", <BookingDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء الحجز" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لا يمكن الإلغاء بعد بدء الموعد.");
  });
});
