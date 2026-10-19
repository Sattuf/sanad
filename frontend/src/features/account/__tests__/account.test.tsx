import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../../stores/session";
import { fakeServer, renderRoute, signIn, signOutLocally } from "../../../test/harness";
import { AccountPage } from "../AccountPages";

const me = {
  id: "u1", email: "salem@example.com", emailConfirmed: true, phoneNumber: null, displayName: "سالم", roles: ["Beneficiary"],
  twoFactorEnabled: false, providerProfileId: null, providerProfileStatus: null, practitionerType: null,
  activeConsents: ["TermsOfService", "PrivacyPolicy"], hasPendingUpgradeRequest: false,
  hideIdentityUntilBookingConfirmed: false, quietHoursStartHourUtc: null, quietHoursEndHourUtc: null,
};
const consent = (type: string, accepted: boolean) => ({
  type, accepted, acceptedVersion: accepted ? "1.0" : null, currentVersion: "1.0", needsReacceptance: false, acceptedAtUtc: accepted ? "2026-10-01T09:00:00Z" : null,
});

function server(extra: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/v1/me": me,
    "GET /api/v1/me/consent": [consent("TermsOfService", true), consent("MarketingCommunication", false)],
    "GET /api/v1/me/access-log": [{ occurredAtUtc: "2026-10-17T09:00:00Z", action: "Scheduling.BeneficiaryNoteRead", actorRole: "AssignedProvider", bookingRequestId: "b1" }],
    ...extra,
  });
}

beforeEach(() => signIn());
afterEach(() => {
  signOutLocally();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("حسابي", () => {
  it("الاسم يُحفظ بعد التغيير فقط، وتفضيلات الخصوصية بالحقول التي يتوقعها الخادم", async () => {
    const api = server({ "PATCH /api/v1/me": { status: 204 }, "PATCH /api/v1/me/privacy-preferences": { status: 204 } });
    renderRoute("/account", "/account", <AccountPage />);

    const name = await screen.findByLabelText("الاسم الظاهر");
    const saveName = screen.getByRole("button", { name: "حفظ" });
    expect(saveName).toBeDisabled();
    fireEvent.change(name, { target: { value: "  سالم أحمد  " } });
    fireEvent.click(saveName);
    expect(await screen.findByText("تم الحفظ.")).toBeInTheDocument();
    expect(api.to("PATCH /api/v1/me")[0].body).toEqual({ displayName: "سالم أحمد" });

    const savePrivacy = screen.getByRole("button", { name: "حفظ تفضيلات الخصوصية" });
    expect(savePrivacy).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/إخفاء اسمي عن المختص/));
    fireEvent.click(screen.getByLabelText(/ساعات هدوء/));
    fireEvent.click(savePrivacy);
    expect(await screen.findByText("تم حفظ تفضيلات الخصوصية.")).toBeInTheDocument();
    expect(api.to("PATCH /api/v1/me/privacy-preferences")[0].body).toEqual({
      hideIdentityUntilBookingConfirmed: true, quietHoursStartHourUtc: 22, quietHoursEndHourUtc: 7,
    });
  });

  it("الموافقة الإلزامية بلا زر سحب، والاختيارية تُمنح، وسجل الاطلاع بتسمياته", async () => {
    const api = server({ "POST /api/v1/me/consent": { status: 204 } });
    renderRoute("/account", "/account", <AccountPage />);

    const terms = (await screen.findByText("شروط الاستخدام")).closest("li")!;
    expect(within(terms).queryByRole("button")).toBeNull();
    expect(within(terms).getByText("موافق")).toBeInTheDocument();

    const marketing = screen.getByText("تذكير يومي اختياري (دعاء/آية اليوم)").closest("li")!;
    fireEvent.click(within(marketing).getByRole("button", { name: "موافقة" }));
    await waitFor(() => expect(api.to("POST /api/v1/me/consent")).toHaveLength(1));
    expect(api.to("POST /api/v1/me/consent")[0].body).toEqual({ type: "MarketingCommunication" });

    expect(await screen.findByText("اطّلع على ملاحظتك للمختص المرفقة بحجز")).toBeInTheDocument();
    expect(screen.getByText(/المختص المكلّف/)).toBeInTheDocument();
  });

  it("التصدير ينزّل ملف JSON ببيانات الخادم", async () => {
    server({ "POST /api/v1/me/export": { profile: { displayName: "سالم" } } });
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), "blob:x"), revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderRoute("/account", "/account", <AccountPage />);

    fireEvent.click(await screen.findByRole("button", { name: "تصدير بياناتي" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader(); // Blob في jsdom بلا text()
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(created[0]);
    });
    expect(JSON.parse(text)).toEqual({ profile: { displayName: "سالم" } });
  });

  it("الحذف يتطلب العبارة حرفياً، ثم يحذف على الخادم وينهي الجلسة ويعود للرئيسية", async () => {
    const api = server({ "DELETE /api/v1/me": { status: 204 }, "POST /api/v1/auth/revoke": { status: 204 } });
    renderRoute("/account", "/account", <AccountPage />);

    const del = await screen.findByRole("button", { name: "حذف حسابي نهائياً" });
    const phrase = screen.getByLabelText("اكتب «احذف حسابي» للتأكيد");
    fireEvent.change(phrase, { target: { value: "احذف حسابى" } }); // ياء غير منقوطة: ليست العبارة
    expect(del).toBeDisabled();
    fireEvent.change(phrase, { target: { value: "احذف حسابي" } });
    fireEvent.click(del);

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
    expect(api.to("DELETE /api/v1/me")[0].body).toEqual({ confirmation: "احذف حسابي" });
    expect(useSession.getState().accessToken).toBeNull();
    expect(sessionStorage.getItem("sanad.refresh")).toBeNull();
  });

  it("رفض الخادم للحذف يُعرض ولا تنتهي الجلسة", async () => {
    server({ "DELETE /api/v1/me": { status: 400, body: { title: "عبارة التأكيد غير مطابقة." } } });
    renderRoute("/account", "/account", <AccountPage />);
    fireEvent.change(await screen.findByLabelText("اكتب «احذف حسابي» للتأكيد"), { target: { value: "احذف حسابي" } });
    fireEvent.click(screen.getByRole("button", { name: "حذف حسابي نهائياً" }));
    expect(await screen.findByText("عبارة التأكيد غير مطابقة.")).toBeInTheDocument();
    expect(useSession.getState().accessToken).toBe("access-1");
  });
});
