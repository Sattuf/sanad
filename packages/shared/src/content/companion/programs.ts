/*
  برامج الالتزام — إطار زمني لعادات يومية مأثورة، لا "خطة علاج".
  عدد الأيام وسيلة للاستمرار فقط، ولا يَعِد بأي نتيجة (references/SKILL.md البندان 3 و4).
  كل مهمة تشير لعنصر في content/library.ts بمصدره.
*/

export type Slot = "morning" | "evening" | "night" | "anytime";
export type Tint = "teal" | "sky" | "sage" | "sand";

export interface ProgramTask {
  /** فريد داخل اليوم */
  id: string;
  itemId: string;
  slot: Slot;
  /** رابط داخلي بدل عرض النص (مثلاً المرشد أو المذكرة) */
  to?: string;
}

export interface ProgramDay {
  day: number;
  title: string;
  tasks: ProgramTask[];
}

export interface Program {
  id: string;
  title: string;
  tagline: string;
  description: string;
  days: number;
  minutesPerDay: number;
  tint: Tint;
  forWhom: string;
  plan: ProgramDay[];
}

export const SLOT_LABEL: Record<Slot, string> = { morning: "الصباح", evening: "المساء", night: "قبل النوم", anytime: "في أي وقت" };

const t = (itemId: string, slot: Slot, to?: string): ProgramTask => ({ id: `${slot}-${itemId}`, itemId, slot, to });

const FORTIFY_BASE = [
  t("bismillah-3", "morning"), t("muawwidhat", "morning"),
  t("kalimat-tammat", "evening"), t("muawwidhat", "evening"),
  t("kursi", "night"), t("baqarah-end", "night"), t("sleep-nafth", "night"),
];

function build(days: number, base: ProgramTask[], focus: Array<[string, ProgramTask[]]>): ProgramDay[] {
  return Array.from({ length: days }, (_, i) => {
    const [title, extra] = focus[i % focus.length];
    return { day: i + 1, title, tasks: [...extra, ...base] };
  });
}

export const PROGRAMS: Program[] = [
  {
    id: "foundation-7",
    title: "أساس التحصين",
    tagline: "٧ أيام لبناء وِردٍ يحميك كل يوم",
    description: "أذكار الصباح والمساء والنوم الثابتة في السنّة، مع عادة جديدة صغيرة كل يوم. البداية المثالية لكل أحد.",
    days: 7,
    minutesPerDay: 10,
    tint: "teal",
    forWhom: "للجميع — وقاية قبل أي شيء",
    plan: build(7, FORTIFY_BASE, [
      ["النية قبل العمل", [t("intention", "anytime")]],
      ["عادة التبريك", [t("tabreek", "anytime")]],
      ["سيّد الاستغفار", [t("sayyid-istighfar", "morning")]],
      ["احفظ دعاء الكرب", [t("dua-karb", "anytime")]],
      ["الفاتحة رقية", [t("fatiha", "anytime")]],
      ["حصّن أهلك", [t("children", "evening")]],
      ["وقفة مع نفسك", [t("reflect", "anytime", "/journal")]],
    ]),
  },
  {
    id: "self-ruqyah-21",
    title: "الرقية الذاتية المأثورة",
    tagline: "٢١ يوماً لتتعلّم كيف ترقي نفسك وأهلك",
    description:
      "ثلاثة أسابيع متدرّجة: أسبوع للأساس، وأسبوع لجلسة رقية ذاتية يومية بالمرشد التفاعلي، وأسبوع للثبات ورقية الأهل. بلا وسيط، وبما ورد فقط.",
    days: 21,
    minutesPerDay: 20,
    tint: "sky",
    forWhom: "لمن يريد الاستغناء: يرقي نفسه وأهله بنفسه",
    plan: [
      ...build(7, FORTIFY_BASE, [
        ["الرقية عبادة لا طقس", [t("intention", "anytime")]],
        ["الفاتحة رقية", [t("fatiha", "anytime")]],
        ["آية الكرسي بتدبّر", [t("kursi", "morning")]],
        ["الرقية بوضع اليد", [t("hand-on-pain", "anytime")]],
        ["رقية النبي ﷺ", [t("ruqyah-nabawiyyah", "anytime")]],
        ["التبريك يحفظك ويحفظ غيرك", [t("tabreek", "anytime")]],
        ["وقفة الأسبوع الأول", [t("reflect", "anytime", "/journal")]],
      ]),
      ...build(7, FORTIFY_BASE, [
        ["جلستك الأولى", [t("self-ruqyah", "anytime", "/self-ruqyah")]],
        ["جلسة + خاتمة القلم", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("qalam-end", "anytime")]],
        ["جلسة + آيات السكينة", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("sakina-verses", "anytime")]],
        ["جلسة + دعاء الكرب", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("dua-karb", "anytime")]],
        ["جلسة + الاستغفار", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("istighfar-100", "anytime")]],
        ["جلسة + دعوة ذي النون", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("dhunnun", "anytime")]],
        ["وقفة الأسبوع الثاني", [t("self-ruqyah", "anytime", "/self-ruqyah"), t("reflect", "anytime", "/journal")]],
      ]).map((d) => ({ ...d, day: d.day + 7 })),
      ...build(7, FORTIFY_BASE, [
        ["ارقِ أحد أهلك", [t("ruqyah-jibril", "anytime")]],
        ["حصّن أطفالك", [t("children", "evening")]],
        ["جلسة رقية ذاتية", [t("self-ruqyah", "anytime", "/self-ruqyah")]],
        ["دعاء ذهاب الهمّ", [t("ibn-masud", "anytime")]],
        ["جلسة رقية ذاتية", [t("self-ruqyah", "anytime", "/self-ruqyah")]],
        ["سورة الشرح", [t("sharh", "anytime")]],
        ["وِردك صار عادة", [t("reflect", "anytime", "/journal")]],
      ]).map((d) => ({ ...d, day: d.day + 14 })),
    ],
  },
  {
    id: "calm-heart-10",
    title: "قلب مطمئن",
    tagline: "١٠ أيام مع أدعية الهمّ والكرب وعادات تهدّئ الجسد",
    description: "للأيام المثقلة بالقلق: أدعية نبوية للهمّ والحزن، وذكر بتمهّل ومشي.",
    days: 10,
    minutesPerDay: 15,
    tint: "sage",
    forWhom: "لمن يمرّ بضيق أو قلق أو ضغط",
    plan: build(10, [t("bismillah-3", "morning"), t("hamm-hazan", "morning"), t("muawwidhat", "evening"), t("slow-dhikr", "anytime")], [
      ["ألا بذكر الله تطمئن القلوب", [t("tumaninah", "anytime")]],
      ["دعاء الكرب", [t("dua-karb", "anytime")]],
      ["دعاء ذهاب الهمّ", [t("ibn-masud", "anytime")]],
      ["آيات السكينة", [t("sakina-verses", "anytime")]],
      ["حركة في الضوء", [t("sun-walk", "anytime")]],
      ["دعوة ذي النون", [t("dhunnun", "anytime")]],
      ["ثلاث نِعَم", [t("gratitude", "night")]],
      ["يا حيّ يا قيّوم", [t("ya-hayy", "anytime")]],
      ["الاستغفار", [t("istighfar-100", "anytime")]],
      ["سورة الشرح ووقفة", [t("sharh", "anytime"), t("reflect", "anytime", "/journal")]],
    ]),
  },
  {
    id: "quiet-nights-14",
    title: "ليالٍ هادئة",
    tagline: "١٤ ليلة لنومٍ مطمئن وروتين ثابت",
    description: "أذكار النوم كاملة، وما ورد عند الفزع والرؤيا المكروهة، مع روتين بسيط قبل النوم بلا شاشات.",
    days: 14,
    minutesPerDay: 10,
    tint: "sand",
    forWhom: "لمن يعاني الأرق أو الفزع الليلي",
    plan: build(14, [t("screens-off", "night"), t("kursi", "night"), t("sleep-nafth", "night"), t("bismika", "night")], [
      ["روتين النوم", [t("slow-dhikr", "night")]],
      ["عند الفزع", [t("faza", "night")]],
      ["الرؤيا المكروهة", [t("bad-dream", "night")]],
      ["خاتمة البقرة", [t("baqarah-end", "night")]],
      ["حركة في الضوء", [t("sun-walk", "anytime")]],
      ["سيّد الاستغفار", [t("sayyid-istighfar", "evening")]],
      ["وقفة الأسبوع", [t("reflect", "anytime", "/journal")]],
    ]),
  },
  {
    // مأخوذ من «البرنامج اليومي» الذي يجمع ما يوصي به أهل العلم عادة، دون الإضافات المبنية على نوع الحالة
    id: "daily-ruqyah-30",
    title: "ورد الرقية اليومي",
    tagline: "٣٠ يوماً من الرقية الذاتية وأذكار اليوم والليلة",
    description:
      "وِرد أطول يجمع ما يوصي به أهل العلم عادةً: أذكار الصباح والمساء، وجلسة رقية ذاتية كل يوم، وسورة البقرة في البيت، وأذكار النوم على طهارة. المدة وسيلة للمداومة، لا عدد مسنون.",
    days: 30,
    minutesPerDay: 30,
    tint: "sky",
    forWhom: "لمن أتمّ الأساس ويريد وِرداً يومياً أطول",
    plan: build(
      30,
      [
        t("bismillah-3", "morning"), t("muawwidhat", "morning"), t("ajwa", "morning"),
        t("self-ruqyah", "anytime", "/self-ruqyah"),
        t("kalimat-tammat", "evening"), t("muawwidhat", "evening"),
        t("wudu-sleep", "night"), t("kursi", "night"), t("baqarah-end", "night"), t("sleep-nafth", "night"),
      ],
      [
        ["النية واليقين", [t("intention", "anytime")]],
        ["آيات موسى مع السحرة", [t("musa-sahara", "anytime")]],
        ["سورة البقرة في البيت", [t("baqarah-home", "anytime")]],
        ["الرقية بوضع اليد", [t("hand-on-pain", "anytime")]],
        ["حِرز اليوم كله", [t("tahlil-100", "morning")]],
        ["رقية النبي ﷺ", [t("ruqyah-nabawiyyah", "anytime")]],
        ["دعاء في آخر الليل", [t("last-third", "night")]],
        ["سيّد الاستغفار", [t("sayyid-istighfar", "morning")]],
        ["دعوة ذي النون", [t("dhunnun", "anytime")]],
        ["وقفة مع نفسك", [t("reflect", "anytime", "/journal")]],
      ],
    ),
  },
];

export function programById(id: string | null | undefined) {
  return PROGRAMS.find((p) => p.id === id);
}

/** الفرق بالأيام بين تاريخين محليين بصيغة YYYY-MM-DD. */
export function daysBetween(fromDay: string, toDay: string): number {
  const [a, b] = [fromDay, toDay].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** اليوم الحالي في البرنامج حسب التقويم (يبدأ من 1، ولا يتجاوز طول البرنامج). */
export function currentProgramDay(startedOn: string | null, length: number, today: string): number {
  if (!startedOn) return 1;
  return Math.min(length, Math.max(1, daysBetween(startedOn, today) + 1));
}
