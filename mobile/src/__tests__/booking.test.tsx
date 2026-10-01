import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import BookScreen from "@/app/book/[providerId]";
import DirectoryScreen from "@/app/(tabs)/directory";
import { useEmergency } from "@/stores/emergency";
import { useSession } from "@/stores/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ providerId: "p1", offering: "o1" }),
}));
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => `key-${++mockUuid}`) }));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const verification = { status: "Approved", lastCheckedAtUtc: null, expiresAtUtc: null, isConditional: false };
const provider = {
  id: "p1", displayName: "د. سارة", declaredTitle: "طبيبة", practitionerType: "LicensedPhysician", track: "LicensedHealth", practiceScope: "…",
  languages: [], deliveryMode: "Remote", city: null, professionalBoundariesNote: "…", organizationId: null, organizationName: null, verification,
  offerings: [{ id: "o1", category: "استشارة", description: "…", cancellationPolicy: "…", explicitExclusions: [], sessionDurationMinutes: 30 }],
};
const slot = { id: "s1", startUtc: "2026-10-05T09:00:00Z", endUtc: "2026-10-05T09:30:00Z", status: "Open" };

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ accessToken: "a", refreshToken: "r", hydrated: true });
  useEmergency.getState().dismiss();
});
afterEach(() => jest.restoreAllMocks());

function serve(onBook: () => Response) {
  return jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/v1/providers/p1") return json(provider);
    if (path === "/api/v1/providers/p1/availability") return json([slot]);
    if (path === "/api/v1/bookings" && init?.method === "POST") return onBook();
    throw new Error(`unexpected ${path}`);
  });
}

async function pickSlot() {
  await fireEvent.press(await screen.findByRole("button", { name: /^\d|[٠-٩]/ }));
}

it("يرسل الحجز بمفتاح Idempotency ويفتح تفاصيله", async () => {
  const fetch = serve(() => json({ id: "b1", status: "Submitted", slotStartUtc: slot.startUtc, slotEndUtc: slot.endUtc, emergencyReferral: null }));
  await wrap(<BookScreen />);
  await pickSlot();
  await fireEvent.press(screen.getByRole("button", { name: "إرسال طلب الحجز" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/bookings/[id]", params: { id: "b1" } }));
  const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
  expect((post[1]!.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^key-/);
  expect(JSON.parse(post[1]!.body as string)).toMatchObject({ serviceOfferingId: "o1", availabilitySlotId: "s1", beneficiaryNote: null });
});

it("الملاحظة لا تُرسل دون موافقة صريحة", async () => {
  serve(() => json({}));
  await wrap(<BookScreen />);
  await pickSlot();
  await fireEvent.changeText(screen.getByLabelText("ملاحظتك للمختص (اختيارية)"), "أشعر بقلق");
  expect(screen.getByRole("button", { name: "إرسال طلب الحجز" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "إرسال طلب الحجز" })).toBeEnabled();
});

it("إشارة خطر مع فشل الحجز ترفع شريط الطوارئ، والتعارض يولّد مفتاحاً جديداً", async () => {
  const fetch = serve(() => json({ title: "الفترة لم تعد متاحة." }, 409, { "X-Sanad-Emergency-Referral": "1" }));
  await wrap(<BookScreen />);
  await pickSlot();
  await fireEvent.press(screen.getByRole("button", { name: "إرسال طلب الحجز" }));
  expect(await screen.findByText("الفترة لم تعد متاحة.")).toBeTruthy();
  expect(useEmergency.getState().referral).not.toBeNull();
  const firstKey = (fetch.mock.calls.find(([, i]) => i?.method === "POST")![1]!.headers as Record<string, string>)["Idempotency-Key"];
  await waitFor(() => expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/availability"))).toHaveLength(2));
  await pickSlot();
  await fireEvent.press(screen.getByRole("button", { name: "إرسال طلب الحجز" }));
  await waitFor(() => expect(fetch.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(2));
  const secondKey = (fetch.mock.calls.filter(([, i]) => i?.method === "POST")[1][1]!.headers as Record<string, string>)["Idempotency-Key"];
  expect(secondKey).not.toBe(firstKey);
});

it("الدليل عام ويحمّل الصفحات التالية", async () => {
  useSession.setState({ accessToken: null, refreshToken: null });
  const item = (id: string) => ({ kind: "Provider", id, displayName: `مختص ${id}`, title: null, track: "WaqfFree", practitionerType: "ReligiousPractitioner", deliveryMode: "Remote", city: null, languages: [], verification, organizationName: null, summary: "…" });
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const page = new URL(String(input)).searchParams.get("page");
    return json(page === "1" ? { items: [item("1")], page: 1, pageSize: 1, total: 2 } : { items: [item("2")], page: 2, pageSize: 1, total: 2 });
  });
  await wrap(<DirectoryScreen />);
  expect(await screen.findByText("مختص 1")).toBeTruthy();
  expect((fetch.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBeUndefined();
  await fireEvent.press(screen.getByRole("button", { name: "عرض المزيد" }));
  expect(await screen.findByText("مختص 2")).toBeTruthy();
});
