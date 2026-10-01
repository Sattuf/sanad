import { AmiriQuran_400Regular } from "@expo-google-fonts/amiri-quran/400Regular";
import { Amiri_400Regular } from "@expo-google-fonts/amiri/400Regular";
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { useSession } from "@/stores/session";
import { fonts, useColors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

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
  }, []);

  // خطأ تحميل الخطوط لا يحبس المستخدم خلف شاشة البداية — يكمل بخط النظام
  const ready = (fontsLoaded || !!fontError) && hydrated;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <EmergencyBanner />
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
            <Stack.Screen name="emergency" options={{ title: "طوارئ", presentation: "modal" }} />
          </Stack>
        </View>
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
