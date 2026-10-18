import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type SessionPort } from "../core";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function setup(responses: Response[], tokens: { access: string | null; refresh: string | null } = { access: null, refresh: null }) {
  const fetch = vi.fn();
  responses.forEach((r) => fetch.mockResolvedValueOnce(r));
  const state = { ...tokens };
  const session: SessionPort = {
    getAccessToken: () => state.access,
    getRefreshToken: () => state.refresh,
    setTokens: (a, r) => Object.assign(state, { access: a, refresh: r }),
    clear: () => Object.assign(state, { access: null, refresh: null }),
  };
  const client = createApiClient({ baseUrl: "https://api.test/", session, fetch });
  return { client, fetch, state };
}

describe("createApiClient — الجلسة", () => {
  it("يرسل رمز الوصول ويزيل الشرطة الأخيرة من العنوان", async () => {
    const { client, fetch } = setup([json({})], { access: "a1", refresh: "r1" });
    await client.api.get("/api/v1/me");
    expect(fetch.mock.calls[0][0]).toBe("https://api.test/api/v1/me");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer a1");
  });

  it("يجدد الرمز عند 401 ويعيد المحاولة مرة واحدة", async () => {
    const tokens = { accessToken: "a2", refreshToken: "r2", accessTokenExpiresAtUtc: "", refreshTokenExpiresAtUtc: "" };
    const { client, fetch, state } = setup([json({}, 401), json(tokens), json({ id: "me" })], { access: "a1", refresh: "r1" });
    await expect(client.api.get("/api/v1/me")).resolves.toEqual({ id: "me" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(state).toEqual({ access: "a2", refresh: "r2" });
  });

  it("رفض التجديد بـ 401 يمسح الجلسة، و429 لا", async () => {
    const rejected = setup([json({}, 401), json({}, 401)], { access: "a1", refresh: "r1" });
    await expect(rejected.client.api.get("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(rejected.state.refresh).toBeNull();

    const limited = setup([json({}, 401), json({}, 429)], { access: "a1", refresh: "r1" });
    await expect(limited.client.api.get("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(limited.state.refresh).toBe("r1");
  });

  it("انقطاع الشبكة يعطي رسالة عربية واضحة", async () => {
    const { client, fetch } = setup([]);
    fetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    const err = (await client.api.get("/api/v1/library").catch((e) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
  });
});
