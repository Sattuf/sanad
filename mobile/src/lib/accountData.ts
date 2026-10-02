import type { QueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { account } from "@/lib/queries";
import { usePlayer } from "@/lib/player";
import { applyReminders, DISABLED } from "@/lib/reminders";
import { pruneKeys } from "@/lib/storage";
import { useSession } from "@/stores/session";

/**
 * بعد حذف الحساب لا يبقى منه شيء على الجهاز: الجلسة (Keychain/Keystore)، وذاكرة الاستعلامات، والمشغّل،
 * والتذكيرات المجدولة، وكل ما خزّنه سند محلياً (تقدّم الورد، أوقات التذكير).
 */
export async function wipeLocalData(qc: QueryClient) {
  usePlayer.getState().stop();
  await applyReminders(DISABLED).catch(() => undefined);
  await pruneKeys("sanad.", () => false);
  useSession.getState().clear();
  qc.clear();
}

/**
 * تصدير البيانات: ملف JSON مؤقت يُسلَّم للوحة المشاركة (حفظ في الملفات، بريد...) ثم يُحذف من ذاكرة التطبيق فوراً —
 * لا تبقى نسخة من بياناتك الشخصية داخل التطبيق.
 */
export async function exportMyData(): Promise<void> {
  const data = await account.exportData();
  const file = new File(Paths.cache, `sanad-my-data-${Date.now()}.json`);
  try {
    file.write(JSON.stringify(data, null, 2));
    if (!(await Sharing.isAvailableAsync())) throw new Error("المشاركة غير متاحة على هذا الجهاز.");
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "بياناتي في سند" });
  } finally {
    try {
      file.delete();
    } catch {
      /* الملف في ذاكرة مؤقتة يمسحها النظام */
    }
  }
}
