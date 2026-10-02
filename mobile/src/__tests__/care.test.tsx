import { HubConnectionBuilder } from "@microsoft/signalr";
import { guides } from "@sanad/shared/content/ruqyah";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ConversationScreen from "@/app/conversations/[id]";
import RecommendationsScreen from "@/app/recommendations";
import { RealtimeBridge } from "@/components/Realtime";
import { guideTarget } from "@/lib/guideLinks";
import { useEmergency } from "@/stores/emergency";
import { useSession } from "@/stores/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "c1" }),
}));
const mockConnection = { on: jest.fn(), start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
jest.mock("@microsoft/signalr", () => ({
  LogLevel: { None: 6 },
  HubConnectionBuilder: jest.fn(() => {
    const b = { withUrl: () => b, withAutomaticReconnect: () => b, configureLogging: () => b, build: () => mockConnection };
    return b;
  }),
}));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ accessToken: "a", refreshToken: "r", hydrated: true });
  useEmergency.getState().dismiss();
});
afterEach(() => jest.restoreAllMocks());

it("كل زر في الأدلة المشتركة يُترجم لمسار في التطبيق", () => {
  const ctas = guides.flatMap((g) => g.sections.flatMap((s) => (s.cta ? [s.cta.to] : [])));
  expect(ctas.length).toBeGreaterThan(0);
  for (const to of ctas) expect(guideTarget(to)).not.toBeNull();
  expect(guideTarget("/directory?track=LicensedHealth")).toEqual({ pathname: "/directory", params: { track: "LicensedHealth" } });
  expect(guideTarget("https://evil.test")).toBeNull();
});

describe("المحادثة", () => {
  function serve(onSend: () => Response) {
    return jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/v1/me/conversations") return json([{ id: "c1", bookingRequestId: "b1", status: "Active", lastMessageAtUtc: null, counterpartDisplayName: "د. سارة" }]);
      if (path === "/api/v1/conversations/c1/messages" && init?.method === "POST") return onSend();
      if (path === "/api/v1/conversations/c1/messages")
        return json([{ id: "m1", conversationId: "c1", senderUserId: "x", isMine: false, body: "أهلاً بك", status: "Sent", sentAtUtc: "2026-10-01T10:00:00Z" }]);
      throw new Error(`unexpected ${path}`);
    });
  }

  it("يعرض الرسائل وتحذير عدم المراقبة، ويرسل رسالة", async () => {
    const fetch = serve(() => json({ id: "m2", conversationId: "c1", sentAtUtc: "2026-10-01T10:01:00Z", emergencyReferral: null }));
    await wrap(<ConversationScreen />);
    expect(await screen.findByText("أهلاً بك")).toBeTruthy();
    expect(screen.getByText(/ليست مراقَبة لحظياً/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("رسالتك"), " متى الموعد؟ ");
    await fireEvent.press(screen.getByLabelText("إرسال"));
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true));
    const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ body: "متى الموعد؟" });
  });

  it("رسالة فيها إشارة خطر ترفع شريط الطوارئ", async () => {
    const referral = { required: true, message: "اتصل الآن", contacts: [{ label: "الطوارئ", phoneNumber: "997" }], emergencyPagePath: "/emergency" };
    serve(() => json({ id: "m3", conversationId: "c1", sentAtUtc: "2026-10-01T10:02:00Z", emergencyReferral: referral }));
    await wrap(<ConversationScreen />);
    await fireEvent.changeText(await screen.findByLabelText("رسالتك"), "رسالة");
    await fireEvent.press(screen.getByLabelText("إرسال"));
    await waitFor(() => expect(useEmergency.getState().referral?.contacts[0].phoneNumber).toBe("997"));
  });
});

it("توصياتي: تعرض التوجيه وتسجّل الاطّلاع", async () => {
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
    init?.method === "POST"
      ? new Response(null, { status: 204 })
      : json([{ id: "r1", bookingRequestId: "b1", providerDisplayName: "د. سارة", guidanceText: "حافظ على أذكار الصباح", recommendedTracks: [], recordedAtUtc: "2026-10-01T10:00:00Z", acknowledgedAtUtc: null }]),
  );
  await wrap(<RecommendationsScreen />);
  expect(await screen.findByText("حافظ على أذكار الصباح")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "تم الاطّلاع" }));
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => String(u).endsWith("/api/v1/me/recommendations/r1/acknowledge") && i?.method === "POST")).toBe(true));
});

describe("الوقت الفعلي", () => {
  it("لا اتصال بلا جلسة", async () => {
    useSession.setState({ accessToken: null, refreshToken: null });
    await wrap(<RealtimeBridge />);
    expect(HubConnectionBuilder).not.toHaveBeenCalled();
  });

  it("يتصل بالجلسة ويغلق الاتصال عند الخروج", async () => {
    const view = await wrap(<RealtimeBridge />);
    expect(mockConnection.start).toHaveBeenCalled();
    expect(mockConnection.on.mock.calls.map((c) => c[0])).toEqual(["messageReceived", "bookingUpdated", "notification"]);
    await act(async () => useSession.getState().clear());
    expect(mockConnection.stop).toHaveBeenCalled();
    await view.unmount();
  });
});
