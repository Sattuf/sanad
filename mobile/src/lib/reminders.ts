import { parseTime, slots, type SlotId } from "@sanad/shared/content/wird";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { readJson, writeJson } from "@/lib/storage";

/*
  تذكير الأذكار على الجوال (ADR-0018): إشعارات محلية مجدولة على الجهاز يومياً بتوقيته — تعمل بلا شبكة ولا خادم،
  ولا تحمّل الخادم شيئاً عند الذروة. نص عام ثابت (اسم الورد فقط) بلا أي بيانات شخصية، والنقر يفتح الورد داخل التطبيق.
*/
export type ReminderTimes = Record<SlotId, string | null>;

const KEY = "sanad.reminders";
const CHANNEL = "adhkar";
export const DISABLED: ReminderTimes = { morning: null, evening: null, sleep: null };

export const loadReminders = () => readJson<ReminderTimes>(KEY, DISABLED);

const identifier = (slot: SlotId) => `sanad-adhkar-${slot}`;

/** الإذن يُطلب عند التفعيل فقط، لا عند فتح التطبيق. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: "تذكير الأذكار", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** يحفظ الأوقات ويعيد جدولة الإشعارات الثلاثة من الصفر (لا تكرار ولا بقايا لأوقات قديمة). */
export async function applyReminders(times: ReminderTimes): Promise<void> {
  await writeJson(KEY, times);
  for (const slot of slots) {
    await Notifications.cancelScheduledNotificationAsync(identifier(slot.id)).catch(() => undefined);
    const time = times[slot.id] ? parseTime(times[slot.id]!) : null;
    if (!time) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: identifier(slot.id),
      content: { title: slot.label, body: `حان وقت ${slot.label}. افتح وردك في سند.`, data: { url: `/ruqyah/${slot.collection}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute, channelId: CHANNEL },
    });
  }
}

/** الإشعار لا يفتح إلا مساراً داخلياً — أي قيمة أخرى تُستبدل بصفحة الرقية (نفس قاعدة عامل الخدمة في الويب). */
export function safeNotificationPath(url: unknown): string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("://") ? url : "/ruqyah";
}
