import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات E2E الحرجة (references/10-frontend-architecture.md §10.11).
 * تتطلب تشغيل الـ API محلياً (Development + DevSeed) والواجهة: راجع README.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // في CI: تقرير HTML يُرفع عند الفشل، وإعادة محاولة واحدة لتمييز التذبذب من الفشل الحقيقي
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.SANAD_WEB_URL ?? "http://localhost:5173",
    locale: "ar",
    trace: "retain-on-failure",
  },
  // التوافقية: المحرّكات الثلاثة (Chrome، Firefox، Safari/WebKit) على الاختبارات الحرجة، واللقطات على الجوال
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /critical\.spec\.ts/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /critical\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /visual\.spec\.ts/ },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] }, testMatch: /visual\.spec\.ts/ },
  ],
});
