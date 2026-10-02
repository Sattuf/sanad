import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

/**
 * Expo Go على Android لم يعد يحمل expo-notifications (منذ SDK 53): مجرد استيراده يرمي خطأً ويُسقط كل شاشة تستورده.
 * لذا يُحمَّل كسولاً هنا فقط، ويبقى null في Expo Go على Android — التذكير يحتاج بناء تطوير أو بناء المتجر هناك.
 */
export const notificationsSupported = !(Platform.OS === "android" && isRunningInExpoGo());

export const Notifications: NotificationsModule | null = notificationsSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- تحميل كسول مقصود: الوحدة غير متاحة في Expo Go على Android
    (require("expo-notifications") as NotificationsModule)
  : null;
