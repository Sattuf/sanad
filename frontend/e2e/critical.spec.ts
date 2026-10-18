import { expect, test } from "@playwright/test";
import { API, acceptedBookingWithSheikh, apiLogin, loginViaUi } from "./helpers";

// references/10-frontend-architecture.md §10.11 — الاختبارات الحرجة

test("1) توصية تحتوي «خذ 500 ملغ» تُرفض برسالة الفلتر ولا تُحفظ", async ({ page, request }) => {
  const bookingId = await acceptedBookingWithSheikh(request);
  await loginViaUi(page, "sheikh@sanad.local");
  await page.goto(`/provider/bookings/${bookingId}/recommend`);
  await expect(page.getByText("هذه التوصية سترسَل مباشرة للمستفيد الآن")).toBeVisible();
  await page.getByLabel("توجيهك للمستفيد").fill("خذ 500 ملغ مرتين يومياً");
  await page.getByRole("button", { name: "إرسال للمستفيد" }).click();
  await expect(page.getByRole("alert")).toContainText("وصف دواء أو جرعة");
  await expect(page.getByText("لا توصيات مرسلة بعد.")).toBeVisible();
});

test("2) المستفيد لا يصل لـ CaseNoteEditor حتى بالرابط المباشر", async ({ page, request }) => {
  const bookingId = await acceptedBookingWithSheikh(request);
  await loginViaUi(page, "beneficiary@sanad.local");
  await page.goto(`/provider/bookings/${bookingId}/private-note`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("ملاحظة إشرافية خاصة")).toHaveCount(0);

  // والخادم نفسه يرفض القراءة (طبقة الحماية الفعلية)
  const token = await apiLogin(request, "beneficiary@sanad.local");
  const res = await request.get(`${API}/api/v1/bookings/${bookingId}/provider-note`, { headers: { Authorization: `Bearer ${token}` } });
  expect([403, 404]).toContain(res.status());
});

test("3) طلب «طبيب» بمستند «تزكية شرعية» ← مرفوض لعدم التطابق", async () => {
  // يتطلب جلسة منسق بتحقق ثنائي؛ مغطّى بالكامل في Api.IntegrationTests (T15_physician_request_with_sharia_endorsement…)
  test.skip(true, "مغطّى في اختبار التكامل T15 — يتطلب منسقاً بجلسة 2FA");
});

test("4) صفحة المشاركة العامة تعمل من متصفح بلا أي جلسة وتشغّل المقطع", async ({ browser, request }) => {
  const token = await apiLogin(request, "beneficiary@sanad.local");
  const library = await (await request.get(`${API}/api/v1/library`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const link = await (await request.post(`${API}/api/v1/library/tracks/${library[0].id}/share-link`, { headers: { Authorization: `Bearer ${token}` } })).json();

  const anonymous = await browser.newContext(); // بلا كوكي ولا تخزين سابق
  const page = await anonymous.newPage();
  await page.goto(link.publicPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(library[0].title);
  await expect(page.getByRole("link", { name: /حسابي|الإشعارات/ })).toHaveCount(0);
  await page.getByRole("button", { name: /تشغيل/ }).click();
  await expect(page.getByRole("button", { name: /إيقاف/ })).toBeVisible();
  await anonymous.close();
});

test("5) لا عنصر واجهة يتعلق باشتراك أو دفع في أي شاشة", async ({ page }) => {
  await loginViaUi(page, "sheikh@sanad.local");
  const forbidden = /(ادفع|الدفع|السعر|الأسعار|اشترك الآن|باقة|payment|subscribe|checkout)/i;
  for (const path of ["/", "/directory", "/dashboard", "/library", "/provider", "/provider/offerings", "/provider/slots", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body"), `المسار ${path}`).not.toContainText(forbidden);
  }
});

