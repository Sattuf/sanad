import { AmiriQuran_400Regular } from "@expo-google-fonts/amiri-quran/400Regular";
import { Amiri_400Regular } from "@expo-google-fonts/amiri/400Regular";
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { RealtimeBridge } from "@/components/Realtime";
import { UpdateGate } from "@/components/UpdateGate";
import { safeNotificationPath } from "@/lib/reminders";
import { pruneOldWird } from "@/lib/wird";
import { useSession } from "@/stores/session";
import { fonts, useColors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

// تذكير يصل والتطبيق مفتوح يظهر أيضاً، بلا صوت مزعج
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** النقر على تذكير يفتح ورده — مساراً داخلياً فقط. */
function useNotificationRouting(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const open = (n: Notifications.Notification) => router.push(safeNotificationPath(n.request.content.data?.url) as never);
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      open(last.notification);
      void Notifications.clearLastNotificationResponseAsync();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [ready]);
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } }));
  const [fontsLoaded, fontError] = useFonts({
    [fonts.body]: IBMPlexSansArabic_400Regular,
    [fonts.bold]: IBMPlexSansArabic_700Bold,
    [fonts.dua]: Amiri_400Regular,
    [fonts.quran]: AmiriQuran_400Regular,
  });
  const hydrated = useSession((s) => s.hydrated);
  const c = useColors();

  useEffect(() => {
    void useSession.getState().hydrate();
    void pruneOldWird();
  }, []);

  // خطأ تحميل الخطوط لا يحبس المستخدم خلف شاشة البداية — يكمل بخط النظام
  const ready = (fontsLoaded || !!fontError) && hydrated;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  useNotificationRouting(ready);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RealtimeBridge />
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <EmergencyBanner />
          <UpdateGate>
            <Stack
              screenOptions={{
                headerTitleStyle: { fontFamily: fonts.bold },
                headerStyle: { backgroundColor: c.surface },
                headerTintColor: c.primary,
                contentStyle: { backgroundColor: c.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "سند" }} />
              <Stack.Screen name="ruqyah/[id]" options={{ title: "" }} />
              <Stack.Screen name="reminders" options={{ title: "تذكير الأذكار" }} />
              <Stack.Screen name="provider/[id]" options={{ title: "" }} />
              <Stack.Screen name="organization/[id]" options={{ title: "" }} />
              <Stack.Screen name="book/[providerId]" options={{ title: "حجز موعد" }} />
              <Stack.Screen name="bookings/index" options={{ title: "حجوزاتي" }} />
              <Stack.Screen name="bookings/[id]" options={{ title: "الحجز" }} />
              <Stack.Screen name="conversations/index" options={{ title: "محادثاتي" }} />
              <Stack.Screen name="conversations/[id]" options={{ title: "المحادثة" }} />
              <Stack.Screen name="recommendations" options={{ title: "توصياتي" }} />
              <Stack.Screen name="health" options={{ title: "الصحة والطمأنينة" }} />
              <Stack.Screen name="guide/[id]" options={{ title: "" }} />
              <Stack.Screen name="settings/profile" options={{ title: "بياناتي الأساسية والخصوصية" }} />
              <Stack.Screen name="settings/data" options={{ title: "الموافقات وبياناتي" }} />
              <Stack.Screen name="settings/delete" options={{ title: "حذف الحساب" }} />
              <Stack.Screen name="emergency" options={{ title: "طوارئ", presentation: "modal" }} />
              <Stack.Screen name="auth/login" options={{ title: "الدخول" }} />
              <Stack.Screen name="auth/email" options={{ title: "البريد الإلكتروني" }} />
              <Stack.Screen name="auth/phone" options={{ title: "رقم الهاتف" }} />
              <Stack.Screen name="auth/two-factor" options={{ title: "التحقق الثنائي" }} />
              <Stack.Screen name="auth/consent" options={{ title: "الموافقات", headerBackVisible: false, gestureEnabled: false }} />
            </Stack>
          </UpdateGate>
        </View>
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
