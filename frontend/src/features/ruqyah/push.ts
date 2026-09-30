import { api } from "../../api/client";

/*
  إشعارات الأذكار على الجوال (Web Push): المتصفح يُنشئ عنوان إشعار لدى خدمة الدفع التابعة له،
  فنحفظه في الحساب مع الأوقات والمنطقة الزمنية، ويرسل الخادم التذكير في وقته حتى والتطبيق مغلق.
  على iPhone لا تعمل إلا بعد إضافة سند إلى الشاشة الرئيسية (iOS 16.4+).
*/

export interface PushConfig { enabled: boolean; publicKey: string | null }

export interface ReminderTimes { morning: string | null; evening: string | null; sleep: string | null }

export interface ReminderDevice extends ReminderTimes { id: string; endpoint: string; timeZone: string; createdAtUtc: string }

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function pushSupport(nav: Navigator = navigator, win: Window = window): PushSupport {
  const hasApis = "serviceWorker" in nav && "PushManager" in win && "Notification" in win;
  if (hasApis) return "supported";
  // سفاري على iPhone يُظهر الإشعارات للتطبيق المثبّت فقط
  if (isIos(nav) && !isStandalone(win)) return "needs-install";
  return "unsupported";
}

export function isIos(nav: Navigator = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export function isStandalone(win: Window = window): boolean {
  return win.matchMedia?.("(display-mode: standalone)").matches || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** مفتاح VAPID العام (base64url) ← البايتات التي يطلبها PushManager.subscribe. */
export function vapidKeyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export const getPushConfig = () => api.get<PushConfig>("/api/v1/public/reminders/push-config", { auth: false });
export const getMyDevices = () => api.get<ReminderDevice[]>("/api/v1/me/reminders/devices");

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function payload(sub: PushSubscription, times: ReminderTimes) {
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", timeZone: localTimeZone(), ...times };
}

/** تسجيل عامل الخدمة (تثبيت التطبيق + استقبال الإشعارات). آمن للاستدعاء أكثر من مرة. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | undefined {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export class PushPermissionDenied extends Error {}

/** بعض المتصفحات لا تردّ أبداً إن تعذّر الوصول لخدمة الدفع — لا نترك الزر معلّقاً. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { window.clearTimeout(timer); resolve(v); }, (e: unknown) => { window.clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); });
  });
}

/** يطلب الإذن (يجب أن يُستدعى من نقرة المستخدم)، ثم يسجّل هذا الجهاز بالأوقات المختارة. */
export async function enablePush(publicKey: string, times: ReminderTimes): Promise<{ device: ReminderDevice; sub: PushSubscription }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushPermissionDenied();
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) }), 20_000));
  return { device: await api.put<ReminderDevice>("/api/v1/me/reminders/device", payload(sub, times)), sub };
}

/** تحديث الأوقات لجهاز مسجّل (والمفاتيح إن جدّدها المتصفح). */
export async function updatePush(sub: PushSubscription, times: ReminderTimes): Promise<ReminderDevice> {
  return api.put<ReminderDevice>("/api/v1/me/reminders/device", payload(sub, times));
}

export async function disablePush(sub: PushSubscription): Promise<void> {
  await api.post("/api/v1/me/reminders/device/remove", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export const sendTestPush = (sub: PushSubscription) => api.post("/api/v1/me/reminders/device/test", { endpoint: sub.endpoint });
