// عامل خدمة بسيط: كل نصوص سند مضمّنة في الحزمة، فيكفي حفظ ما يُحمَّل ليعمل التطبيق دون إنترنت.
const CACHE = "sanad-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// التنقّل: الشبكة أولاً ثم آخر نسخة محفوظة (فتصل التحديثات). الملفات المجزّأة (/assets/) ثابتة: من المحفوظ أولاً.
// لا يُخزَّن أي طلب إلى الـ API ولا من أصل آخر — بيانات شخصية (ADR-0017).
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const put = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  };
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(put)));
});

// ── تذكير الورد وإتمام الختمة (Web Push، ADR-0017 وADR-0021) ──
// النص عام وثابت من الخادم. الإشعار لا يفتح إلا مساراً داخل التطبيق؛ أي رابط آخر يُستبدل بالصفحة الرئيسية.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "سند";
  const body = typeof data.body === "string" ? data.body : "وردك اليوم جاهز.";
  const url = typeof data.url === "string" && /^\.\/(#\/[\w\-/]*)?$/.test(data.url) ? data.url : "./";
  e.waitUntil(self.registration.showNotification(title, {
    body, dir: "rtl", lang: "ar", icon: "./icon.svg", badge: "./icon.svg", tag: typeof data.tag === "string" ? data.tag : "sanad", data: { url },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url ? e.notification.data.url : "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.navigate(target).then((w) => (w || c).focus());
    return self.clients.openWindow(target);
  }));
});
