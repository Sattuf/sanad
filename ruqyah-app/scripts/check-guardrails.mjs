// فحص آلي لحدود سند التي لا تُكسر (.claude/skills/sanad-ruqyah-app/SKILL.md):
// لا كلمات تشخيص أو وعد بالشفاء في نصوص الواجهة، ولا أي كود دفع أو بيع، ولا حقل لوصف الحالة.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const rules = [
  { name: "تشخيص أو وعد", re: /تشخيص|إصابتك|نوع الإصابة|أعراضك|مسحور|ممسوس|معيون|شفاء مضمون|فك السحر|نسبة نجاح|حالات شُفيت|برنامج علاجي/ },
  { name: "كود دفع أو بيع", re: /stripe|paypal|checkout|payment|in-?app-?purchase|\bprice\b/i },
  { name: "حقل لوصف الحالة", re: /\b(symptoms?|diagnos\w*|condition(Type)?|affliction)\b/i },
  { name: "سلاسل ونقاط", re: /streak|لا تقطع سلسلتك|badge/i },
];

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "__tests__" && f !== "test") walk(p); }
    else if (/\.(tsx?|css|html|webmanifest)$/.test(f)) files.push(p);
  }
})("src");
files.push("index.html", "public/manifest.webmanifest");

let failed = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return; // التعليقات تشرح الحدود نفسها
    for (const r of rules) if (r.re.test(line)) { failed++; console.error(`${f}:${i + 1} [${r.name}] ${line.trim()}`); }
  });
}
if (failed) { console.error(`\n${failed} مخالفة.`); process.exit(1); }
console.log(`حدود سند سليمة في ${files.length} ملفاً.`);
