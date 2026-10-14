import { companionApi } from "../api/companion";
import type { Reminder } from "../domain/enrollment";
import { load, save } from "./storage";

/*
  تذكير يومي واحد بإشعار الجهاز (Web Push بمعيار المتصفح، ADR-0017). يتطلب حساباً لأن الخادم هو من يرسل في الوقت.
  نص الإشعار ثابت وهادئ: «وردك اليوم جاهز.» — لا ذكر للأيام الفائتة ولا لأي شيء شخصي.
*/
export const defaultTimes: Record<Reminder, string> = { after_fajr: "05:30", after_maghrib: "18:30", before_sleep: "22:00" };

const KEY = "push";
interface PushState { endpoint: string; reminder: Reminder; time: string }

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const currentPush = () => load<PushState | null>(KEY, null);

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const toB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("./sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

export async function enablePush(reminder: Reminder, time: string) {
  const config = await companionApi.pushConfig();
  if (!config.enabled || !config.publicKey) throw new Error("التذكير بالإشعارات غير متاح حالياً.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("لم يُسمح بالإشعارات على هذا الجهاز. فعّلها من إعدادات المتصفح.");
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(config.publicKey) }));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  await companionApi.saveDevice({
    endpoint: sub.endpoint,
    p256dh: toB64(sub.getKey("p256dh")),
    auth: toB64(sub.getKey("auth")),
    timeZone,
    morning: reminder === "after_fajr" ? time : null,
    evening: reminder === "after_maghrib" ? time : null,
    sleep: reminder === "before_sleep" ? time : null,
  });
  save(KEY, { endpoint: sub.endpoint, reminder, time } satisfies PushState);
}

export async function disablePush() {
  const state = currentPush();
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* لا شيء */
  }
  if (state) await companionApi.removeDevice(state.endpoint).catch(() => {});
  save(KEY, null);
}

export async function testPush() {
  const state = currentPush();
  if (state) await companionApi.testDevice(state.endpoint);
}
