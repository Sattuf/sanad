import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pushSupport, vapidKeyToBytes } from "../push";

const pub = resolve(__dirname, "../../../../public");

describe("إشعارات الأذكار", () => {
  it("يحوّل مفتاح VAPID العام (base64url) إلى 65 بايتاً تبدأ بـ 0x04", () => {
    // نقطة P-256 غير مضغوطة: 0x04 ثم 64 بايتاً، بترميز base64url بلا حشو
    const key = btoa(String.fromCharCode(4, ...Array.from({ length: 64 }, (_, i) => i))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const bytes = vapidKeyToBytes(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("يطلب التثبيت على iPhone قبل الإشعارات، ويدعمها حيث تتوفر الواجهات", () => {
    const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 } as Navigator;
    const safari = { matchMedia: () => ({ matches: false }), navigator: iphone } as unknown as Window;
    expect(pushSupport(iphone, safari)).toBe("needs-install");

    const android = { userAgent: "Android", platform: "Linux", maxTouchPoints: 5, serviceWorker: {} } as unknown as Navigator;
    const chrome = { PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }), navigator: android } as unknown as Window;
    expect(pushSupport(android, chrome)).toBe("supported");
  });

  it("بيان التطبيق عربي من اليمين، وأيقوناته وعامل الخدمة موجودة", () => {
    const manifest = JSON.parse(readFileSync(resolve(pub, "manifest.webmanifest"), "utf8")) as {
      lang: string; dir: string; display: string; icons: { src: string; purpose: string }[]; shortcuts: { url: string }[];
    };
    expect(manifest).toMatchObject({ lang: "ar", dir: "rtl", display: "standalone" });
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) expect(existsSync(resolve(pub, `.${icon.src}`))).toBe(true);
    for (const s of manifest.shortcuts) expect(s.url.startsWith("/ruqyah")).toBe(true);
    expect(existsSync(resolve(pub, "icons/apple-touch-icon.png"))).toBe(true);
  });

  it("عامل الخدمة لا يخزّن طلبات الـ API ولا يفتح روابط خارجية من الإشعار", () => {
    const sw = readFileSync(resolve(pub, "sw.js"), "utf8");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toMatch(/startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
  });
});
