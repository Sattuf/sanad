import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmergencyReferralBanner } from "../../components/safety";
import { useEmergency } from "../../stores/emergency";
import { useSession } from "../../stores/session";
import { ApiError, api } from "../client";

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("api client — مسار الإحالة العاجلة", () => {
  beforeEach(() => {
    useEmergency.getState().dismiss();
    useSession.getState().clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("يرفع شريط الطوارئ من الترويسة حتى عند فشل الطلب", async () => {
    mockFetch(json({ title: "الفترة غير متاحة", code: "conflict" }, 409, { "X-Sanad-Emergency-Referral": "1" }));
    await expect(api.post("/api/v1/bookings", {})).rejects.toBeInstanceOf(ApiError);
    expect(useEmergency.getState().referral?.required).toBe(true);
  });

  it("يستخدم معلومات الإحالة القادمة في جسم الاستجابة", async () => {
    const referral = { required: true, message: "اتصل الآن", contacts: [{ label: "طوارئ", phoneNumber: "997" }], emergencyPagePath: "/emergency" };
    mockFetch(json({ id: "x", emergencyReferral: referral }));
    await api.post("/api/v1/bookings", {});
    expect(useEmergency.getState().referral?.contacts[0].phoneNumber).toBe("997");
  });

  it("لا يرفع الشريط لاستجابة عادية", async () => {
    mockFetch(json({ ok: true }));
    await api.get("/api/v1/directory");
    expect(useEmergency.getState().referral).toBeNull();
  });

  it("يجدد الرمز عند 401 ويعيد المحاولة مرة واحدة", async () => {
    useSession.getState().setTokens("old", "refresh-1");
    const fetchMock = mockFetch(
      json({ title: "unauth" }, 401),
      json({ accessToken: "new", refreshToken: "refresh-2", accessTokenExpiresAtUtc: "", refreshTokenExpiresAtUtc: "" }),
      json({ id: "me" }),
    );
    await expect(api.get<{ id: string }>("/api/v1/me")).resolves.toEqual({ id: "me" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useSession.getState().accessToken).toBe("new");
  });

  it("لا يُخرج المستخدم إن رُفض التجديد بحد المعدل (429)", async () => {
    useSession.getState().setTokens("old", "refresh-1");
    mockFetch(json({ title: "unauth" }, 401), json({ title: "rate" }, 429));
    await expect(api.get("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().refreshToken).toBe("refresh-1");
  });

  it("يعرض رسالة أول حقل من أخطاء التحقق", async () => {
    mockFetch(json({ title: "طلب غير صالح.", errors: { email: ["بريد غير صالح"] } }, 400));
    const err = await api.post("/api/v1/auth/register/email", {}).catch((e: ApiError) => e);
    expect((err as ApiError).friendly).toBe("بريد غير صالح");
  });
});

describe("EmergencyReferralBanner", () => {
  it("يعرض أرقام الطوارئ عند رفع العلم", () => {
    useEmergency.getState().raise(null);
    render(<MemoryRouter><EmergencyReferralBanner /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("اطلب المساعدة الآن");
    expect(screen.getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112");
  });
});
