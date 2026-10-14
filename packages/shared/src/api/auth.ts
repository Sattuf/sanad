import type { ApiClient } from "./core";
import type { AuthProviders, AuthResponse, MobileMinVersion } from "./types";

/*
  نقاط دخول المصادقة — مشتركة بين الويب والجوال حتى يبقى العقد في مكان واحد.
  كلها بلا رمز وصول (auth: false)؛ CAPTCHA تُمرَّر كترويسة حين يطلبها الخادم.
*/
type Api = ApiClient["api"];
const anon = (headers?: Record<string, string>) => ({ auth: false, headers });

export const captchaHeaders = (token: string | null | undefined): Record<string, string> | undefined =>
  token ? { "X-Captcha-Token": token } : undefined;

export function authApi(api: Api) {
  return {
    providers: () => api.get<AuthProviders>("/api/v1/auth/providers", anon()),
    minVersion: () => api.get<MobileMinVersion>("/api/v1/public/app/min-version", anon()),

    loginEmail: (email: string, password: string) => api.post<AuthResponse>("/api/v1/auth/login/email", { email: email.trim(), password }, anon()),
    registerEmail: (
      body: { email: string; password: string; displayName: string; acceptTerms: boolean; acceptPrivacyPolicy: boolean },
      captcha?: string | null,
    ) => api.post<AuthResponse>("/api/v1/auth/register/email", { ...body, email: body.email.trim(), displayName: body.displayName.trim() }, anon(captchaHeaders(captcha))),

    requestOtp: (phoneNumber: string, captcha?: string | null) => api.post<void>("/api/v1/auth/phone/request-otp", { phoneNumber }, anon(captchaHeaders(captcha))),
    verifyOtp: (phoneNumber: string, code: string, email?: string) =>
      api.post<AuthResponse>("/api/v1/auth/phone/verify-otp", { phoneNumber, code, email: email?.trim() || undefined }, anon()),

    googleNative: (idToken: string) => api.post<AuthResponse>("/api/v1/auth/google/native", { idToken }, anon()),
    apple: (identityToken: string, nonce: string, displayName?: string | null) =>
      api.post<AuthResponse>("/api/v1/auth/apple", { identityToken, nonce, displayName: displayName || undefined }, anon()),

    verifyTwoFactor: (ticket: string, code: string) => api.post<AuthResponse>("/api/v1/auth/login/2fa/verify", { ticket, code }, anon()),
    revoke: (refreshToken: string | null) => api.post<void>("/api/v1/auth/revoke", { refreshToken }),
  };
}

/** جلسة مكتملة تُحفظ مباشرة؛ غير ذلك مرحلة وسيطة (رمز 2FA، أو مراحل إدارية تُكمل على الويب). */
export function completedTokens(res: AuthResponse): { access: string; refresh: string } | null {
  if (res.stage !== "Succeeded" || !res.accessToken || !res.refreshToken) return null;
  return { access: res.accessToken, refresh: res.refreshToken };
}
