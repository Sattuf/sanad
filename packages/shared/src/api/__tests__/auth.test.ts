import { describe, expect, it, vi } from "vitest";
import { authApi, completedTokens } from "../auth";
import { createApiClient } from "../core";
import type { AuthResponse } from "../types";

function setup() {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  const client = createApiClient({
    baseUrl: "https://api.test",
    session: { getAccessToken: () => "secret-access", getRefreshToken: () => null, setTokens: () => {}, clear: () => {} },
    onEmergency: () => {},
    fetch,
  });
  return { auth: authApi(client.api), fetch };
}

describe("authApi", () => {
  it("لا يرسل رمز الوصول لنقاط الدخول، ويمرّر CAPTCHA كترويسة", async () => {
    const { auth, fetch } = setup();
    await auth.requestOtp("+966512345678", "captcha-token");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.test/api/v1/auth/phone/request-otp");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-Captcha-Token"]).toBe("captcha-token");
  });

  it("يقصّ المسافات من البريد والاسم", async () => {
    const { auth, fetch } = setup();
    await auth.registerEmail({ email: " a@b.test ", password: "P", displayName: " سارة ", acceptTerms: true, acceptPrivacyPolicy: true });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ email: "a@b.test", displayName: "سارة" });
  });

  it("يرسل رمز أبل والقيمة الأصلية لـ nonce", async () => {
    const { auth, fetch } = setup();
    await auth.apple("id-token", "raw-nonce", "عبدالله");
    expect(fetch.mock.calls[0][0]).toBe("https://api.test/api/v1/auth/apple");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ identityToken: "id-token", nonce: "raw-nonce", displayName: "عبدالله" });
  });

  it("الخروج يرسل رمز الوصول لإبطاله", async () => {
    const { auth, fetch } = setup();
    await auth.revoke("r1");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer secret-access");
  });
});

describe("completedTokens", () => {
  const base: AuthResponse = { userId: "u", stage: "Succeeded", isNewUser: false, accessToken: "a", accessTokenExpiresAtUtc: null, refreshToken: "r", refreshTokenExpiresAtUtc: null, ticket: null };

  it("يعيد الرموز فقط لجلسة مكتملة", () => {
    expect(completedTokens(base)).toEqual({ access: "a", refresh: "r" });
    expect(completedTokens({ ...base, stage: "RequiresTwoFactorCode", accessToken: null, refreshToken: null, ticket: "t" })).toBeNull();
  });
});
