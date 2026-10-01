import AsyncStorage from "@react-native-async-storage/async-storage";
import { findCollection } from "@sanad/shared/content/ruqyah";
import { buildEntries, localDay } from "@sanad/shared/content/wird";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useWirdProgress } from "@/lib/wird";
import { useSession } from "@/stores/session";

const sleep = findCollection("sleep")!;
const entries = buildEntries("sleep", sleep.items);
const key = `sanad.wird.sleep.${localDay()}`;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSession.setState({ accessToken: null, refreshToken: null, hydrated: true });
});
afterEach(() => jest.restoreAllMocks());

it("بلا حساب: يعدّ ويحفظ في الجهاز دون أي طلب", async () => {
  const fetch = jest.spyOn(globalThis, "fetch");
  const { result } = await renderHook(() => useWirdProgress("sleep", entries), { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(async () => result.current.bump(entries[0]));
  expect(result.current.counts["0"]).toBe(1);
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(key))!)).toEqual({ "0": 1 }));
  expect(fetch).not.toHaveBeenCalled();
});

it("يستأنف تقدّم اليوم المحفوظ في الجهاز", async () => {
  await AsyncStorage.setItem(key, JSON.stringify({ "0": 1, "1": 1 }));
  const { result } = await renderHook(() => useWirdProgress("sleep", entries), { wrapper });
  await waitFor(() => expect(result.current.counts).toMatchObject({ "0": 1, "1": 1 }));
});

it("مع حساب: يدمج تقدّم الحساب ويحفظ النقرات فيه", async () => {
  useSession.setState({ accessToken: "a", refreshToken: "r" });
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) =>
    init?.method === "PUT"
      ? new Response(null, { status: 204 })
      : json({ day: localDay(), streak: 0, completedDays: [], collections: [{ collectionId: "sleep", counts: { "2": 1 }, completedItems: 1, totalItems: entries.length }] }),
  );
  const { result } = await renderHook(() => useWirdProgress("sleep", entries), { wrapper });
  await waitFor(() => expect(result.current.counts["2"]).toBe(1));

  await act(async () => result.current.bump(entries[0]));
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true), { timeout: 3000 });
  const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(JSON.parse(put[1]!.body as string)).toMatchObject({ collectionId: "sleep", day: localDay(), counts: { "0": 1, "2": 1 } });
});

it("«ابدأ من جديد» يصفّر حتى ما جاء من الحساب", async () => {
  useSession.setState({ accessToken: "a", refreshToken: "r" });
  jest.spyOn(globalThis, "fetch").mockImplementation(async () =>
    json({ day: localDay(), streak: 0, completedDays: [], collections: [{ collectionId: "sleep", counts: { "0": 1 }, completedItems: 1, totalItems: entries.length }] }),
  );
  const { result } = await renderHook(() => useWirdProgress("sleep", entries), { wrapper });
  await waitFor(() => expect(result.current.counts["0"]).toBe(1));
  await act(async () => result.current.reset());
  expect(result.current.completed).toBe(0);
});
