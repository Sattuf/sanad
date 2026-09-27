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
  reporter: [["list"]],
  use: {
    baseURL: process.env.SANAD_WEB_URL ?? "http://localhost:5173",
    locale: "ar",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /visual\.spec\.ts/ },
  ],
});
