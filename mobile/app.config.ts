import type { ExpoConfig } from "expo/config";

// إعداد تطبيق سند للجوال — ADR-0018. المجلدان ios/ وandroid/ يولّدهما Expo (لا يُعدَّلان يدوياً).
const config: ExpoConfig = {
  name: "سند",
  slug: "sanad",
  scheme: "sanad",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.sanad",
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "app.sanad",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#0f5c58" },
    // لا أذونات افتراضية؛ كل إذن يُضاف صراحةً مع سببه
    permissions: [],
    blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.RECORD_AUDIO"],
  },
  plugins: [
    "expo-router",
    // سند عربية فقط في هذا الإصدار — الواجهة من اليمين لليسار دائماً، أياً كانت لغة الجهاز
    ["expo-localization", { forcesRTL: true, supportedLocales: { ios: ["ar"], android: ["ar"] } }],
    "expo-secure-store",
    "expo-font",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#f6f3ec", dark: { backgroundColor: "#0d0f14" } }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
