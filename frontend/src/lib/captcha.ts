/** رمز CAPTCHA (Cloudflare Turnstile) إن حُمّل على الصفحة — وإلا بلا ترويسة (التطوير). الخادم يرفض بدونه في الإنتاج. */
export function captchaHeader(): Record<string, string> {
  const token = (window as unknown as { __sanadCaptchaToken?: string }).__sanadCaptchaToken;
  return token ? { "X-Captcha-Token": token } : {};
}
