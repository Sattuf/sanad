// يصدّر الخطط المضمَّنة إلى ملف يبذره الخادم في بيئة التطوير فقط (DevDataSeeder) — حتى تعمل المزامنة والختمة مع الخطط نفسها.
// التشغيل: npm run export:dev-plans
import { writeFileSync } from "node:fs";
import { authors, bundledPlans } from "../src/content/plans";

const kind = { quran: "Quran", dhikr: "Dhikr", note: "Note" } as const;

const out = {
  note: "مولَّد من ruqyah-app/src/content/plans.ts بـ npm run export:dev-plans — بيانات تطوير فقط، لا يُعدَّل يدوياً.",
  authors: authors.map((a) => ({ key: a.id, displayName: a.displayName, bio: a.bio })),
  plans: bundledPlans.map((p) => ({
    key: p.id,
    title: p.title,
    summary: p.summary,
    contents: p.contents,
    authorKey: p.authorId,
    durationDays: p.durationDays,
    minutesPerDay: p.minutesPerDay,
    days: p.days.map((d) => ({
      day: d.day,
      items: d.items.map((i) =>
        i.kind === "quran"
          ? { kind: kind.quran, quranKey: i.key, title: i.title, note: i.note ?? null, repeat: i.repeat }
          : i.kind === "dhikr"
            ? { kind: kind.dhikr, title: i.title, text: i.text, source: i.source, note: i.note ?? null, repeat: i.repeat }
            : { kind: kind.note, text: i.text, repeat: 1 },
      ),
    })),
  })),
};

writeFileSync(process.argv[2], JSON.stringify(out) + "\n");
console.log(`exported ${out.plans.length} plans`);
