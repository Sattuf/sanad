// يصدّر محتوى الحزمة المشتركة وأنماط السلامة إلى JSON يقرؤه تطبيق Flutter (ADR-0023).
// المصدر الوحيد هو TypeScript هنا — لا تُعدَّل ملفات JSON يدوياً.
//   node scripts/export-dart.mjs           ← يكتب mobile_flutter/assets/content/*.json
//   node scripts/export-dart.mjs --check   ← يفشل إن لم تطابق الملفات المصدر (CI)
// يقرأ ملفات TS مباشرة بإزالة الأنواع المدمجة في Node (22.18+ / 23.6+)، بلا أي اعتماد.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// استيرادات الحزمة بلا امتداد (أسلوب Vite/Metro) ← نجرّب .ts
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const src = (p) => new URL(`../src/${p}`, import.meta.url).href;
const { quran } = await import(src("content/quran.ts"));
const { LIBRARY } = await import(src("content/companion/library.ts"));
const { PROGRAMS, SLOT_LABEL } = await import(src("content/companion/programs.ts"));
const { MYTHS, MYTH_SUGGESTIONS, VERDICT_META } = await import(src("content/companion/myths.ts"));
const { QUIZ, QUIZ_TIERS, QUIZ_RECOMMENDATIONS } = await import(src("content/companion/quiz.ts"));
const { GUIDE_MODES, GUIDE_NAFTH_ITEM, HAND_STEP, INTENTION_TIPS, guideSteps } = await import(src("content/companion/guide.ts"));
const { PACED_DHIKR, PULSE_SECONDS, SAKINA_NEEDS, SAKINA_NEED_ORDER, SAKINA_REPEAT } = await import(src("content/companion/sakina.ts"));
const { JOURNAL_METRICS, STABLE_DELTA, TREND_DAYS, TREND_MIN_ENTRIES } = await import(src("content/companion/journal.ts"));
const { ar } = await import(src("i18n/ar.ts"));
const { GROUP_ORDER, HERO_VERSES, collections, groups, guides, suggestedWird } = await import(src("content/ruqyah.ts"));
const { MAX_COUNT, slotForHour, slots } = await import(src("content/wird.ts"));
const { RECITERS } = await import(src("content/recitation.ts"));
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const GENERATED = "مولَّد من packages/shared بـ scripts/export-dart.mjs — لا يُعدَّل يدوياً (ADR-0023)";
const files = {
  "quran.json": { $generated: GENERATED, passages: quran },
  "companion.json": {
    $generated: GENERATED,
    library: LIBRARY,
    programs: PROGRAMS,
    slotLabel: SLOT_LABEL,
    myths: MYTHS,
    verdictMeta: VERDICT_META,
    mythSuggestions: MYTH_SUGGESTIONS,
    quiz: { questions: QUIZ, tiers: QUIZ_TIERS, recommendations: QUIZ_RECOMMENDATIONS },
    // خطوات المرشد محسوبة لكل وضع، فلا يُعاد منطق العناوين في Dart
    guide: {
      modes: GUIDE_MODES,
      steps: Object.fromEntries(GUIDE_MODES.map((m) => [m.id, guideSteps(m.id)])),
      nafthItemId: GUIDE_NAFTH_ITEM,
      intentionTips: INTENTION_TIPS,
      hand: HAND_STEP,
    },
    journal: { metrics: JOURNAL_METRICS, trendDays: TREND_DAYS, trendMinEntries: TREND_MIN_ENTRIES, stableDelta: STABLE_DELTA },
    sakina: { needOrder: SAKINA_NEED_ORDER, needs: SAKINA_NEEDS, repeat: SAKINA_REPEAT, pacedDhikr: PACED_DHIKR, pulseSeconds: PULSE_SECONDS },
  },
  // «الرقية والتحصين»: المجموعات والأدلة، وأوقات الورد
  "ruqyah.json": {
    $generated: GENERATED,
    groups,
    groupOrder: GROUP_ORDER,
    heroVerses: HERO_VERSES,
    collections,
    guides: guides.map((g) => ({ ...g, kind: g.kind ?? "method" })),
    // الدالتان محسوبتان لكل ساعة، فلا يُعاد منطقهما ولا نصوصهما في Dart
    suggestedWirdByHour: HOURS.map(suggestedWird),
    reciters: RECITERS,
    wird: { slots, maxCount: MAX_COUNT, slotByHour: HOURS.map((h) => slotForHour(h)?.id ?? null) },
  },
  // تسميات الواجهة المشتركة (التنقل، فئات المكتبة…) — الويب يقرؤها من i18n/ar.ts
  "strings.json": { $generated: GENERATED, ar },
};

const outDir = fileURLToPath(new URL("../../../mobile_flutter/assets/content/", import.meta.url));
const check = process.argv.includes("--check");
const stale = [];
if (!check) mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const text = `${JSON.stringify(data, null, 1)}\n`;
  if (check) {
    let current = "";
    try {
      current = readFileSync(outDir + name, "utf8").replace(/\r\n/g, "\n");
    } catch {
      /* غير موجود */
    }
    if (current !== text) stale.push(name);
  } else writeFileSync(outDir + name, text);
}
if (stale.length) {
  console.error(`ملفات Flutter لا تطابق packages/shared: ${stale.join("، ")}\nشغّل: node packages/shared/scripts/export-dart.mjs`);
  process.exit(1);
}
console.log(check ? "محتوى Flutter مطابق للمصدر ✓" : `كُتبت ${Object.keys(files).length} ملفات في mobile_flutter/assets/content`);
