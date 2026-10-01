import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { router as mockRouter } from "expo-router";
import EmailScreen from "@/app/auth/email";
import { UpdateGate } from "@/components/UpdateGate";
import { useSession } from "@/stores/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "0.1.0" } } }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const providers = { google: false, captchaEnabled: false, captchaSiteKey: null, googleNative: false, apple: false };
const tokens = { userId: "u1", stage: "Succeeded", isNewUser: false, accessToken: "a1", accessTokenExpiresAtUtc: null, refreshToken: "r1", refreshTokenExpiresAtUtc: null, ticket: null };
const me = (consents: string[]) => ({ id: "u1", displayName: "سارة", email: "s@sanad.test", phoneNumber: null, roles: ["Beneficiary"], activeConsents: consents });

/** خادم مزيّف بحسب المسار — يكفي لمسار الدخول كاملاً. */
function serve(routes: Record<string, () => Response>) {
  return jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler();
  });
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ accessToken: null, refreshToken: null, hydrated: true });
});
afterEach(() => jest.restoreAllMocks());

async function loginWith(consents: string[]) {
  serve({
    "/api/v1/auth/providers": () => json(providers),
    "/api/v1/auth/login/email": () => json(tokens),
    "/api/v1/me": () => json(me(consents)),
  });
  await wrap(<EmailScreen />);
  await fireEvent.changeText(screen.getByLabelText("البريد الإلكتروني"), "s@sanad.test");
  await fireEvent.changeText(screen.getByLabelText("كلمة المرور"), "Strong-Pass-123");
  await fireEvent.press(screen.getByRole("button", { name: "دخول" }));
}

it("الدخول بالبريد يحفظ الجلسة ويفتح «حسابي»", async () => {
  await loginWith(["TermsOfService", "PrivacyPolicy"]);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/account"));
  expect(useSession.getState().refreshToken).toBe("r1");
});

it("حساب بلا موافقات يُوجَّه لشاشة الموافقات أولاً", async () => {
  await loginWith([]);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/auth/consent"));
});

it("خطأ الخادم يظهر برسالته العربية", async () => {
  serve({
    "/api/v1/auth/providers": () => json(providers),
    "/api/v1/auth/login/email": () => json({ title: "بيانات الدخول غير صحيحة." }, 401),
  });
  await wrap(<EmailScreen />);
  await fireEvent.changeText(screen.getByLabelText("البريد الإلكتروني"), "s@sanad.test");
  await fireEvent.changeText(screen.getByLabelText("كلمة المرور"), "wrong");
  await fireEvent.press(screen.getByRole("button", { name: "دخول" }));
  expect(await screen.findByText("بيانات الدخول غير صحيحة.")).toBeTruthy();
  expect(useSession.getState().refreshToken).toBeNull();
});

describe("UpdateGate", () => {
  const app = <UpdateGate><Text>التطبيق</Text></UpdateGate>;

  it("يطلب التحديث إن كان الإصدار أقدم من الحد الأدنى", async () => {
    serve({ "/api/v1/public/app/min-version": () => json({ ios: "9.0.0", android: "9.0.0", iosStoreUrl: null, androidStoreUrl: null }) });
    await wrap(app);
    expect(await screen.findByText("يلزم تحديث سند")).toBeTruthy();
    expect(screen.getByRole("button", { name: /112/ })).toBeTruthy();
  });

  it("يعمل كالمعتاد بلا شبكة", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network request failed"));
    await wrap(app);
    expect(await screen.findByText("التطبيق")).toBeTruthy();
  });
});
