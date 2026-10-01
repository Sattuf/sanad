import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { api } from "@/lib/api";
import { useEmergency } from "@/stores/emergency";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderBanner = () => render(<SafeAreaProvider initialMetrics={metrics}><EmergencyBanner /></SafeAreaProvider>);

beforeEach(() => useEmergency.getState().dismiss());
afterEach(() => jest.restoreAllMocks());

it("إشارة الخطر في استجابة فاشلة ترفع الشريط على الجوال", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ title: "تعارض" }, 409, { "X-Sanad-Emergency-Referral": "1" }));
  await expect(api.post("/api/v1/bookings", {})).rejects.toThrow("تعارض");
  expect(useEmergency.getState().referral?.contacts[0].phoneNumber).toBe("112");
});

it("لا يظهر الشريط بلا إشارة", async () => {
  await renderBanner();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("يعرض أرقام الطوارئ ويتصل مباشرة عند الضغط", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  useEmergency.getState().raise({ required: true, message: "اتصل الآن", contacts: [{ label: "الإسعاف", phoneNumber: "997" }], emergencyPagePath: "/emergency" });
  await renderBanner();
  expect(screen.getByText("اطلب المساعدة الآن")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("الإسعاف 997"));
  expect(openURL).toHaveBeenCalledWith("tel:997");
});
