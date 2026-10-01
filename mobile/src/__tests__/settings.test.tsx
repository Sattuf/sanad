import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import DataSettingsScreen from "@/app/settings/data";
import DeleteAccountScreen from "@/app/settings/delete";
import { exportMyData } from "@/lib/accountData";
import { usePlayer } from "@/lib/player";
import { useSession } from "@/stores/session";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  AndroidImportance: { DEFAULT: 3 },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
const mockFiles: { name: string; content?: string; deleted: boolean }[] = [];
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache://" },
  File: class {
    entry: { name: string; content?: string; deleted: boolean };
    uri: string;
    constructor(_dir: string, name: string) {
      this.entry = { name, deleted: false };
      this.uri = `cache://${name}`;
      mockFiles.push(this.entry);
    }
    write(content: string) {
      this.entry.content = content;
    }
    delete() {
      this.entry.deleted = true;
    }
  },
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFiles.length = 0;
  await AsyncStorage.clear();
  useSession.setState({ accessToken: "a", refreshToken: "r", hydrated: true });
});
afterEach(() => jest.restoreAllMocks());

describe("حذف الحساب", () => {
  it("لا يُفعَّل الزر إلا بالعبارة الحرفية", async () => {
    await wrap(<DeleteAccountScreen />);
    const button = screen.getByRole("button", { name: "حذف حسابي نهائياً" });
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("اكتب «احذف حسابي» للتأكيد"), "احذف");
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("اكتب «احذف حسابي» للتأكيد"), "احذف حسابي");
    expect(button).toBeEnabled();
  });

  it("بعد التأكيد الأخير: يحذف على الخادم ثم يمسح كل شيء من الجهاز", async () => {
    await AsyncStorage.multiSet([["sanad.wird.sleep.2026-10-01", "{}"], ["sanad.reminders", "{}"], ["other.app", "x"]]);
    usePlayer.setState({ track: { id: "t", title: "t", subtitle: "s", uri: "u" } });
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      if (buttons?.[1]?.text === "احذف") buttons[1].onPress?.();
    });

    await wrap(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText("اكتب «احذف حسابي» للتأكيد"), "احذف حسابي");
    await fireEvent.press(screen.getByRole("button", { name: "حذف حسابي نهائياً" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/me$/);
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ confirmation: "احذف حسابي" });
    expect(useSession.getState()).toMatchObject({ accessToken: null, refreshToken: null });
    expect(usePlayer.getState().track).toBeNull();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect([...(await AsyncStorage.getAllKeys())]).toEqual(["other.app"]);
  });

  it("فشل الحذف لا يمسح الجلسة", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(json({ title: "تعذّر الحذف الآن." }, 500));
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await wrap(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText("اكتب «احذف حسابي» للتأكيد"), "احذف حسابي");
    await fireEvent.press(screen.getByRole("button", { name: "حذف حسابي نهائياً" }));
    expect(await screen.findByText("تعذّر الحذف الآن.")).toBeTruthy();
    expect(useSession.getState().refreshToken).toBe("r");
  });
});

it("التصدير يشارك ملف JSON ثم يحذفه من التطبيق", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(json({ profile: { displayName: "سارة" } }));
  await exportMyData();
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/^cache:\/\/sanad-my-data-\d+\.json$/), expect.objectContaining({ mimeType: "application/json" }));
  expect(mockFiles).toHaveLength(1);
  expect(JSON.parse(mockFiles[0].content!)).toEqual({ profile: { displayName: "سارة" } });
  expect(mockFiles[0].deleted).toBe(true);
});

it("الموافقات الاختيارية تُسحب، والإلزامية لا زر لها", async () => {
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (path === "/api/v1/me/consent")
      return json([
        { type: "TermsOfService", accepted: true, acceptedVersion: "1", currentVersion: "1", needsReacceptance: false, acceptedAtUtc: "2026-09-01T00:00:00Z" },
        { type: "MarketingCommunication", accepted: true, acceptedVersion: "1", currentVersion: "1", needsReacceptance: false, acceptedAtUtc: "2026-09-01T00:00:00Z" },
      ]);
    if (path === "/api/v1/me/access-log") return json([]);
    throw new Error(path);
  });
  await wrap(<DataSettingsScreen />);
  expect(await screen.findByText("لا أحد اطّلع على بياناتك حتى الآن.")).toBeTruthy();
  const revoke = await screen.findAllByRole("button", { name: "سحب الموافقة" });
  expect(revoke).toHaveLength(1);
  await fireEvent.press(revoke[0]);
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => String(u).endsWith("/api/v1/me/consent/MarketingCommunication") && i?.method === "DELETE")).toBe(true));
});
