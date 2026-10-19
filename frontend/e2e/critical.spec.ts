import { expect, test } from "@playwright/test";
import { API, acceptedBookingWithSheikh, apiLogin, loginViaUi } from "./helpers";

// references/10-frontend-architecture.md §10.11 — الاختبارات الحرجة

test("1) توصية تحتوي «نضمن لك الشفاء» تُرفض برسالة الفلتر ولا تُحفظ", async ({ page, request }) => {
  const bookingId = await acceptedBookingWithSheikh(request);
  await loginViaUi(page, "sheikh@sanad.local");
  await page.goto(`/provider/bookings/${bookingId}/recommend`);
  await expect(page.getByText("هذه التوصية سترسَل مباشرة للمستفيد الآن")).toBeVisible();
  await page.getByLabel("توجيهك للمستفيد").fill("نضمن لك الشفاء بعد ثلاث جلسات");
  await page.getByRole("button", { name: "إرسال للمستفيد" }).click();
  await expect(page.getByRole("alert")).toContainText("وعد بشفاء مضمون");
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

test("3) طلب ترقية بمستند خارج القائمة المسموحة ← مرفوض", async () => {
  // يتطلب جلسة منسق بتحقق ثنائي؛ مغطّى بالكامل في Api.IntegrationTests (T15_upgrade_request_with_document_outside_the_allowed_list…)
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
  // كلمات كاملة (مع حرف عطف/جر ملتصق) من النص المرئي بفواصل عناصره؛ textContent يلصق العناصر فتتكوّن كلمات وهمية
  // («وإرشاد» + «فعّالة» ← «…ادفع…»)
  const forbidden = /(?:^|[\s\p{P}])[وفبل]?(ادفع|الدفع|السعر|الأسعار|اشترك الآن|باقة)|(payment|subscribe|checkout)/iu;
  for (const path of ["/", "/directory", "/dashboard", "/library", "/provider", "/provider/offerings", "/provider/slots", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const text = await page.evaluate(() => document.body.innerText);
    expect(text, `المسار ${path}`).not.toMatch(forbidden);
  }
});


test("6) الجلسة: رمز الوصول في الذاكرة فقط، والخروج يبطل رمز التحديث على الخادم", async ({ page, request }) => {
  await loginViaUi(page, "beneficiary@sanad.local");
  const stored = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    cookies: document.cookie,
    refresh: sessionStorage.getItem("sanad.refresh"),
  }));
  // لا JWT (يبدأ بـ eyJ) ولا رمز تحديث في localStorage أو الكوكيز؛ رمز التحديث وحده في sessionStorage (ADR-0014)
  expect(stored.local).not.toMatch(/eyJ|refresh/i);
  expect(stored.cookies).not.toMatch(/eyJ|refresh/i);
  expect(stored.session).not.toMatch(/eyJ/);
  expect(stored.refresh).toBeTruthy();

  await page.getByRole("button", { name: "خروج", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("sanad.refresh"))).toBeNull();
  const reuse = await request.post(`${API}/api/v1/auth/refresh`, { data: { refreshToken: stored.refresh } });
  expect([400, 401]).toContain(reuse.status());

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("7) نص المستخدم يُعرض نصاً: لا تنفيذ لسكربت في الاسم أو رسالة المحادثة (XSS مخزّن)", async ({ page, request }) => {
  const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
  const bookingId = await acceptedBookingWithSheikh(request);
  const token = await apiLogin(request, "beneficiary@sanad.local");
  const auth = { Authorization: `Bearer ${token}` };
  const original = (await (await request.get(`${API}/api/v1/me`, { headers: auth })).json()).displayName as string;
  try {
    expect((await request.patch(`${API}/api/v1/me`, { headers: auth, data: { displayName: `مستفيد ${payload}`.slice(0, 100) } })).ok()).toBeTruthy();
    const conv = await (await request.post(`${API}/api/v1/bookings/${bookingId}/conversation`, { headers: auth })).json();
    expect((await request.post(`${API}/api/v1/conversations/${conv.id}/messages`, { headers: auth, data: { body: payload } })).ok()).toBeTruthy();

    await loginViaUi(page, "beneficiary@sanad.local");
    for (const path of ["/dashboard", "/account", `/conversations/${conv.id}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `المسار ${path}`).toBeUndefined();
    }
    await expect(page.getByText(payload).first()).toBeVisible(); // ظاهر نصاً حرفياً (في الرسالة، وفي الاسم أعلى الصفحة)
    await loginViaUi(page, "sheikh@sanad.local");
    await page.goto(`/conversations/${conv.id}`);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  } finally {
    await request.patch(`${API}/api/v1/me`, { headers: auth, data: { displayName: original } });
  }
});
