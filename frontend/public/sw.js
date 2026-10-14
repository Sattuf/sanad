/*
  Service Worker لسند — هدفه الوحيد أن يفتح التطبيق (وخاصة وضع السكينة) دون إنترنت.
  - التنقّل: الشبكة أولاً، وعند الانقطاع آخر نسخة محفوظة من index.html.
  - الأصول الثابتة (/assets، الخطوط): من الذاكرة ثم تحديث في الخلفية.
  - لا يلمس /api ولا أي نطاق خارجي (التلاوات تُدار بـ Cache API داخل الصفحة).
*/
const SHELL = "sanad-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/favicon.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sanad-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api") || url.pathname.startsWith("/hubs")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || /\.(woff2?|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});
