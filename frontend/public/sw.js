/*
  عامل خدمة «سند»: يجعل الموقع تطبيقاً قابلاً للتثبيت، ويعرض تذكير الأذكار القادم من الخادم (Web Push).
  - لا يخزّن أي طلب إلى الـ API (بيانات شخصية) ولا أي طلب من أصل آخر.
  - التنقّل: الشبكة أولاً، وعند انقطاعها آخر نسخة من الواجهة — فتفتح الأذكار دون اتصال.
  - ملفات /assets/ مُجزّأة الاسم فتُخدم من التخزين مباشرة.
*/
const VERSION = "sanad-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/favicon.svg"];

/** الواجهة + ملفات البناء التي تذكرها صفحتها (أسماؤها مُجزّأة فتتغير مع كل إصدار). */
async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL);
  const html = await (await cache.match("/")).text();
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];
  await cache.addAll(assets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match("/", { ignoreVary: true })) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  // ignoreVary: طلبات السكربت الوحدوية تحمل Origin، والخادم قد يرسل Vary: Origin فلا تطابق النسخة المحفوظة
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/hubs/")) return;

  if (request.mode === "navigate") event.respondWith(networkFirst(request));
  else if (/^\/(assets|icons|library)\//.test(url.pathname)) event.respondWith(cacheFirst(request));
  else if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request, { ignoreVary: true })) ?? Response.error()));
  }
});

/** مسار داخلي فقط — لا يفتح الإشعار أي موقع خارجي. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/ruqyah";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "سند";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "حان وقت أذكارك.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "ar",
      dir: "rtl",
      tag: typeof data.tag === "string" ? data.tag : "sanad",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w && "navigate" in w ? w.navigate(target) : undefined));
      return self.clients.openWindow(target);
    }),
  );
});
