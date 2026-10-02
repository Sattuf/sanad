import * as AppleAuthentication from "expo-apple-authentication";
import { finishSignIn, signInWithApple, signOut } from "@/lib/auth";
import { useSession } from "@/stores/session";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: jest.fn(() => "raw-nonce-part"),
  digestStringAsync: jest.fn(async (_alg: string, value: string) => jest.requireActual("node:crypto").createHash("sha256").update(value).digest("hex").toUpperCase()),
}));

jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(async () => true),
  formatFullName: jest.fn(() => "عبدالله"),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const succeeded = { userId: "u1", stage: "Succeeded", isNewUser: true, accessToken: "a1", accessTokenExpiresAtUtc: null, refreshToken: "r1", refreshTokenExpiresAtUtc: null, ticket: null } as const;

beforeEach(() => useSession.setState({ accessToken: null, refreshToken: null, hydrated: true }));
afterEach(() => jest.restoreAllMocks());

describe("finishSignIn", () => {
  it("يحفظ جلسة مكتملة", () => {
    expect(finishSignIn({ ...succeeded })).toEqual({ kind: "done", isNewUser: true });
    expect(useSession.getState()).toMatchObject({ accessToken: "a1", refreshToken: "r1" });
  });

  it("يطلب رمز 2FA بالتذكرة دون حفظ أي رمز", () => {
    expect(finishSignIn({ ...succeeded, stage: "RequiresTwoFactorCode", accessToken: null, refreshToken: null, ticket: "t1" })).toEqual({ kind: "two-factor", ticket: "t1" });
    expect(useSession.getState().refreshToken).toBeNull();
  });

  it("المراحل الإدارية تُكمل على الويب", () => {
    expect(finishSignIn({ ...succeeded, stage: "RequiresTwoFactorSetup", accessToken: null, refreshToken: null, ticket: "t" }).kind).toBe("web-only");
  });
});

describe("signInWithApple", () => {
  it("يعطي أبل SHA-256 للـ nonce ويرسل القيمة الأصلية للخادم", async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: "apple-jwt", fullName: { givenName: "عبدالله" } });
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(json(succeeded));

    await signInWithApple();

    const raw = "raw-nonce-partraw-nonce-part";
    const sentToApple = (AppleAuthentication.signInAsync as jest.Mock).mock.calls[0][0].nonce;
    // SHA-256(raw) بحروف صغيرة — كما يحسبه الخادم
    expect(sentToApple).toBe("a61cd5324ccde22ab2432ce74c278e7af52e6cd2e5597ff76f14adb2d75d480a");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/apple$/);
    expect(JSON.parse(init.body as string)).toEqual({ identityToken: "apple-jwt", nonce: raw, displayName: "عبدالله" });
  });

  it("إلغاء المستخدم لا يرسل شيئاً", async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }));
    const fetch = jest.spyOn(globalThis, "fetch");
    await expect(signInWithApple()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("الخروج يمسح الجلسة حتى بلا شبكة", async () => {
  useSession.getState().setTokens("a", "r");
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network request failed"));
  await signOut();
  expect(useSession.getState()).toMatchObject({ accessToken: null, refreshToken: null });
});
