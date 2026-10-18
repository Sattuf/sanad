// صور التوثيق في docs/images — تُعاد بأمر واحد بعد أي تغيير بصري:
//   1) شغّل الواجهة: cd frontend && npm run dev
//   2) node scripts/docs-screenshots.mjs
// صفحات الويب المختارة تعمل بلا خادم (محلية أولاً، ADR-0022). صور تطبيق الجوال هي لقطات المراجعة
// المعتمدة في mobile_flutter/test/screenshots، تُصغَّر هنا لعرض 360 بكسل بدل نسخها بحجمها الكامل.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.env.SANAD_WEB_URL ?? "http://localhost:5173";

const web = [
  ["today", "/today"],
  ["programs", "/programs"],
  ["ruqyah", "/ruqyah"],
  ["sakina", "/sakina"],
  ["awareness", "/awareness"],
  ["health", "/health"],
];

const app = [
  "today_light",
  "programs_light",
  "ruqyah_hub",
  "ruqyah_collection",
  "self_ruqyah_modes",
  "sakina",
  "journal_trends",
  "library",
  "ruqyah_hub_dark",
];

const browser = await chromium.launch();

const webDir = resolve(root, "docs/images/web");
rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "ar", reducedMotion: "reduce", colorScheme: "light" });
for (const [name, path] of web) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  // JPEG: صفحات المشاهد صور فوتوغرافية، وPNG يضاعف حجمها أضعافاً
  await page.screenshot({ path: resolve(webDir, `${name}.jpg`), type: "jpeg", quality: 82 });
  console.log(`web/${name}.jpg`);
}

const appDir = resolve(root, "docs/images/app");
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
const viewer = await browser.newPage({ viewport: { width: 360, height: 780 } });
for (const name of app) {
  // صفحة فارغة لا تحمّل file://، فتُضمَّن الصورة نفسها
  const src = `data:image/png;base64,${readFileSync(resolve(root, `mobile_flutter/test/screenshots/${name}.png`)).toString("base64")}`;
  await viewer.setContent(`<body style="margin:0"><img src="${src}" style="width:360px;display:block"></body>`);
  await viewer.waitForFunction(() => document.querySelector("img")?.complete);
  await viewer.locator("img").screenshot({ path: resolve(appDir, `${name}.png`) });
  console.log(`app/${name}.png`);
}

await browser.close();
