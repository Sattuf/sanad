// يولّد src/content/quran.generated.json من api.alquran.cloud (رواية حفص، الرسم العثماني).
// النص القرآني لا يُكتب يدوياً أبداً — يُجلب من مصدر موثوق ويُراجَع ثم يُثبَّت في المستودع.
// التشغيل: node scripts/fetch-quran.mjs
import { writeFile } from "node:fs/promises";

const RANGES = [
  [1, 1, 7], [2, 255, 255], [2, 285, 286], [2, 248, 248], [9, 26, 26], [9, 40, 40],
  [48, 4, 4], [48, 18, 18], [48, 26, 26], [13, 28, 28], [17, 82, 82], [10, 57, 57],
  [21, 87, 87], [68, 51, 52], [94, 1, 8], [112, 1, 4], [113, 1, 5], [114, 1, 6],
];

const out = {};
for (const [s, from, to] of RANGES) {
  const res = await fetch(`https://api.alquran.cloud/v1/surah/${s}/quran-uthmani`);
  if (!res.ok) throw new Error(`surah ${s}: ${res.status}`);
  const { data } = await res.json();
  for (const a of data.ayahs.filter((a) => a.numberInSurah >= from && a.numberInSurah <= to)) {
    let text = a.text.replace(/^﻿/, "").trim();
    // تبدأ الآية الأولى من كل سورة (عدا الفاتحة) بالبسملة في هذا المصدر — نفصلها
    // (تختلف همزة الوصل بين السور في المصدر، فنفصل الكلمات الأربع الأولى بدل مطابقة النص حرفياً)
    if (s !== 1 && s !== 9 && a.numberInSurah === 1 && text.startsWith("بِسْمِ")) text = text.split(" ").slice(4).join(" ");
    out[`${s}:${a.numberInSurah}`] = { surah: s, ayah: a.numberInSurah, surahName: data.name.replace(/^سُورَةُ\s*/, ""), text };
  }
}
await writeFile(new URL("../src/content/quran.generated.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(Object.keys(out).length, "ayahs");
