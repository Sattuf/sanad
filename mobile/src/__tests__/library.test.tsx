import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import LibraryScreen from "@/app/(tabs)/library";
import { usePlayer } from "@/lib/player";
import { useSession } from "@/stores/session";

const mockPlayer = {
  playing: false,
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  setActiveForLockScreen: jest.fn(),
  clearLockScreenControls: jest.fn(),
  addListener: jest.fn(),
};
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const stored = { id: "t1", title: "سورة البقرة", sourceLabel: "مصدر موثوق", description: null, category: "QuranRecitation", durationSeconds: 125, audioUrl: "/api/v1/media/tracks/t1", mediaKind: "StoredAudio", youTubeVideoId: null, sourceUrl: null };
const youtube = { ...stored, id: "t2", title: "دعاء مرئي", category: "Dua", mediaKind: "YouTube", audioUrl: null, youTubeVideoId: "abc123" };

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><LibraryScreen /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  usePlayer.setState({ track: null, playing: false });
  useSession.setState({ accessToken: "a", refreshToken: "r", hydrated: true });
});
afterEach(() => jest.restoreAllMocks());

it("بلا حساب: دعوة للدخول بلا أي طلب", async () => {
  useSession.setState({ accessToken: null, refreshToken: null });
  const fetch = jest.spyOn(globalThis, "fetch");
  await wrap();
  expect(screen.getByText("المكتبة متاحة بحساب مجاني.")).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it("يشغّل المقطع المخزّن بمشغّل الخلفية مع شاشة القفل، ويفتح YouTube في مصدره", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).includes("/me/favorites") ? json([]) : json([stored, youtube]),
  );
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await wrap();

  await fireEvent.press(await screen.findByLabelText("تشغيل سورة البقرة"));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: "http://localhost:5080/api/v1/media/tracks/t1" });
  expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(true, expect.objectContaining({ title: "سورة البقرة" }));
  expect(screen.getByText("مصدر موثوق")).toBeTruthy(); // شريط التشغيل

  await fireEvent.press(screen.getByLabelText("تشغيل دعاء مرئي"));
  expect(openURL).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123");
});

it("المفضلة تُرسل للخادم", async () => {
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    init?.method === "POST" ? new Response(null, { status: 204 }) : String(input).includes("/me/favorites") ? json([]) : json([stored]),
  );
  await wrap();
  await fireEvent.press(await screen.findByLabelText("أضف للمفضلة"));
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => String(u).endsWith("/api/v1/me/favorites") && i?.method === "POST")).toBe(true));
});

it("إيقاف المشغّل يزيل أزرار شاشة القفل", async () => {
  await act(async () => usePlayer.getState().play({ id: "x", title: "t", subtitle: "s", uri: "https://a/b.mp3" }));
  await act(async () => usePlayer.getState().stop());
  expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
  expect(usePlayer.getState().track).toBeNull();
});
