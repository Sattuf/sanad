import * as SecureStore from "expo-secure-store";
import { useSession } from "@/stores/session";

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  useSession.setState({ accessToken: null, refreshToken: null, hydrated: false });
});

it("يحفظ رمز التحديث في التخزين الآمن، ورمز الوصول في الذاكرة فقط", async () => {
  useSession.getState().setTokens("access-1", "refresh-1");
  await Promise.resolve();
  expect(store.get("sanad.refresh")).toBe("refresh-1");
  expect([...store.values()]).not.toContain("access-1");
});

it("يستعيد الجلسة بعد إعادة تشغيل التطبيق", async () => {
  store.set("sanad.refresh", "refresh-saved");
  await useSession.getState().hydrate();
  expect(useSession.getState()).toMatchObject({ hydrated: true, refreshToken: "refresh-saved", accessToken: null });
});

it("تسجيل الخروج يمسح الرمز المحفوظ", async () => {
  useSession.getState().setTokens("a", "r");
  useSession.getState().clear();
  await Promise.resolve();
  expect(store.has("sanad.refresh")).toBe(false);
  expect(useSession.getState().refreshToken).toBeNull();
});

it("رمز وصل أثناء التحميل لا يُستبدل بالقديم المحفوظ", async () => {
  store.set("sanad.refresh", "old");
  const hydrating = useSession.getState().hydrate();
  useSession.getState().setTokens("a", "fresh");
  await hydrating;
  expect(useSession.getState().refreshToken).toBe("fresh");
});
