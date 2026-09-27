import { test } from "@playwright/test";
import { acceptedBookingWithDoctor, loginViaUi } from "./helpers";

// لقطات مراجعة بصرية (ليست اختبارات مقارنة بكسلية) — تُحفظ في test-results/screens
const shot = (name: string, project: string) => ({ path: `test-results/screens/${project}-${name}.png`, fullPage: true });

test("لقطات الشاشات الرئيسية", async ({ page, request }, info) => {
  const p = info.project.name;
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await page.waitForTimeout(800);
  await page.screenshot(shot("login-dark", p));

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.waitForTimeout(600);
  await page.screenshot(shot("home-light", p));

  await page.goto("/directory");
  await page.waitForLoadState("networkidle");
  await page.screenshot(shot("directory", p));

  await page.goto("/emergency");
  await page.screenshot(shot("emergency", p));

  const bookingId = await acceptedBookingWithDoctor(request);
  await loginViaUi(page, "doctor@sanad.local");
  await page.goto(`/provider/bookings/${bookingId}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot(shot("provider-workspace", p));
  await page.goto(`/provider/bookings/${bookingId}/private-note`);
  await page.screenshot(shot("private-note", p));
  await page.goto(`/provider/bookings/${bookingId}/recommend`);
  await page.waitForLoadState("networkidle");
  await page.screenshot(shot("recommend", p));

  await loginViaUi(page, "beneficiary@sanad.local");
  await page.goto("/library");
  await page.waitForLoadState("networkidle");
  await page.screenshot(shot("library", p));
});
