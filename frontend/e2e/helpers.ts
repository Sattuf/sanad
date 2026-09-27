import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.SANAD_API_URL ?? "http://localhost:5080";
export const DEMO_PASSWORD = "Demo-Pass-123";

/** دخول بالبريد عبر الواجهة الحقيقية (شاشة المصباح). */
export async function loginViaUi(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByRole("button", { name: /البريد الإلكتروني/ }).click();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
}

export async function apiLogin(request: APIRequestContext, email: string, password = DEMO_PASSWORD) {
  const res = await request.post(`${API}/api/v1/auth/login/email`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken as string;
}

/** حجز مقبول بين المستفيد التجريبي والطبيبة التجريبية — عبر الـ API لتسريع التهيئة. */
export async function acceptedBookingWithDoctor(request: APIRequestContext) {
  const beneficiary = await apiLogin(request, "beneficiary@sanad.local");
  const doctor = await apiLogin(request, "doctor@sanad.local");
  const dir = await (await request.get(`${API}/api/v1/directory?practitionerType=LicensedPhysician`)).json();
  const providerId = dir.items[0].id as string;
  const provider = await (await request.get(`${API}/api/v1/providers/${providerId}`)).json();
  const slots = await (await request.get(`${API}/api/v1/providers/${providerId}/availability`, { headers: { Authorization: `Bearer ${beneficiary}` } })).json();
  const booking = await request.post(`${API}/api/v1/bookings`, {
    headers: { Authorization: `Bearer ${beneficiary}`, "Idempotency-Key": crypto.randomUUID() },
    data: { serviceOfferingId: provider.offerings[0].id, availabilitySlotId: slots[0].id, consentToSensitiveNoteProcessing: false },
  });
  expect(booking.ok()).toBeTruthy();
  const { id } = await booking.json();
  const accept = await request.post(`${API}/api/v1/bookings/${id}/accept`, { headers: { Authorization: `Bearer ${doctor}` } });
  expect(accept.ok()).toBeTruthy();
  return id as string;
}
