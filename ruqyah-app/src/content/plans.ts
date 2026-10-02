import { collections, type Item } from "@sanad/shared/content/ruqyah";
import { quran, type QuranKey } from "@sanad/shared/content/quran";

/*
  خطط الرقية — product-spec.md §3 وcontent-guardrails.md §2–3.

  النصوص لا تُكتب هنا: الآيات من quran.ts (المصحف بالرسم العثماني، مولَّد آلياً ومختبَر حرفياً)
  والأذكار من ruqyah.ts مع تخريجها. هذا الملف يرتّب تلك النصوص في أيام فقط.

  المعدّون هنا عناصر نائبة واضحة: لا تُنشر خطة باسم شيخ قبل إذنه المكتوب، ومراجعة شرعية ثانية، وفحص الأمان.
  الخطط توصف بمحتواها ومدتها، لا بحالة المستخدم.
*/

export type Duration = 7 | 14 | 21 | 40;
export const DURATIONS: Duration[] = [7, 14, 21, 40];

export interface Author {
  id: string;
  displayName: string;
  bio: string;
  /** مرجع الإذن المكتوب وتاريخه. null = لم يُستلم الإذن بعد، فتُعرض الخطة «تجريبية». */
  consentRef: string | null;
  consentDate: string | null;
}

export interface QuranRef {
  surah: number;
  fromAyah: number;
  toAyah: number;
}

export type WirdItem =
  | { kind: "quran"; key: QuranKey; ref: QuranRef; title: string; note?: string; repeat: number }
  | { kind: "dhikr"; title: string; text: string; source: string; note?: string; repeat: number }
  | { kind: "note"; text: string };

export interface PlanDay {
  day: number;
  items: WirdItem[];
}

export interface Plan {
  id: string;
  title: string;
  authorId: string;
  durationDays: Duration;
  minutesPerDay: number;
  summary: string;
  contents: string;
  days: PlanDay[];
  review: { shariaReviewer: string | null; safetyCheckedAt: string | null };
  version: number;
  publishedAt: string | null;
  /** خطة منشورة من الخادم: معدّها مضمَّن (إذنه مسجَّل)، ونُشرت بعد مراجعة ثانية وفحص أمان. */
  remote?: { author: Author; isCurrent: boolean };
}

export const authors: Author[] = [
  {
    id: "author-a",
    displayName: "المعدّ الأول",
    bio: "يُستبدل هذا السطر باسم الشيخ ونبذته كما يوافق عليها كتابةً.",
    consentRef: null,
    consentDate: null,
  },
  {
    id: "author-b",
    displayName: "المعدّ الثاني",
    bio: "يُستبدل هذا السطر باسم الشيخ ونبذته كما يوافق عليها كتابةً.",
    consentRef: null,
    consentDate: null,
  },
];

// ── بناء الورد من المحتوى المدقّق ───────────────────────────────

function fromShared(item: Item): WirdItem {
  if (item.kind === "quran") {
    const p = quran[item.ref];
    return {
      kind: "quran",
      key: item.ref,
      ref: { surah: p.surah, fromAyah: p.from, toAyah: p.to },
      title: item.title,
      note: item.note,
      repeat: item.repeat ?? 1,
    };
  }
  return { kind: "dhikr", title: item.title, text: item.text, source: item.source, note: item.note, repeat: item.repeat ?? 1 };
}

function collection(id: string): Item[] {
  const c = collections.find((x) => x.id === id);
  if (!c) throw new Error(`مجموعة غير موجودة: ${id}`);
  return c.items;
}

/** عناصر من مجموعة، مع استبعاد ما لا يناسب الورد اليومي بالعنوان. */
function pick(id: string, opts: { only?: string[]; except?: string[] } = {}): WirdItem[] {
  return collection(id)
    .filter((i) => (opts.only ? opts.only.includes(i.title) : true))
    .filter((i) => !(opts.except ?? []).includes(i.title))
    .map(fromShared);
}

const repeatDays = (n: number, build: (day: number) => WirdItem[]): PlanDay[] =>
  Array.from({ length: n }, (_, i) => ({ day: i + 1, items: build(i + 1) }));

// أذكار تُستبعد من الورد: ما يتعلق بالرؤى (لا تفسير أحلام)، وما يحتاج أداة أو شخصاً آخر.
const SLEEP_EXCLUDE = ["عند الرؤيا المكروهة"];
const SUNNAH_FOR_SELF = ["رقية النبي ﷺ للمريض", "رقية جبريل عليه السلام للنبي ﷺ", "وضع اليد على موضع الألم", "تعويذ النبي ﷺ للحسن والحسين"];

const morningEvening = pick("morning-evening");
const sleep = pick("sleep", { except: SLEEP_EXCLUDE });
const ruqyahQuran = pick("ruqyah-quran");
const ruqyahSunnah = pick("ruqyah-sunnah", { only: SUNNAH_FOR_SELF });
const shifa = pick("shifa");
const hamm = pick("hamm");
const muawwidhat = pick("ruqyah-quran", { only: ["سورة الفاتحة", "آية الكرسي", "سورة الإخلاص", "سورة الفلق", "سورة الناس"] });

const half = Math.ceil(ruqyahQuran.length / 2);
const NOT_A_TREATMENT: WirdItem = { kind: "note", text: "اقرأ بتدبّر وطمأنينة. والرقية لا تعني ترك العلاج الموصوف لك." };

const DRAFT_REVIEW = { shariaReviewer: null, safetyCheckedAt: null };

const allPlans: Plan[] = [
  {
    id: "morning-evening-7",
    title: "تحصين الصباح والمساء",
    authorId: "author-a",
    durationDays: 7,
    minutesPerDay: 12,
    summary: "المعوذات وآية الكرسي وأذكار اليوم والليلة",
    contents: "آية الكرسي، والمعوذات ثلاثاً، وأذكار الصباح والمساء الثابتة في السنة.",
    days: repeatDays(7, () => morningEvening),
    review: DRAFT_REVIEW,
    version: 1,
    publishedAt: null,
  },
  {
    id: "before-sleep-7",
    title: "ورد ما قبل النوم",
    authorId: "author-b",
    durationDays: 7,
    minutesPerDay: 6,
    summary: "آية الكرسي وخواتيم البقرة وأذكار النوم",
    contents: "آية الكرسي، وخواتيم سورة البقرة، والنفث بالمعوذات، وأذكار النوم.",
    days: repeatDays(7, () => sleep),
    review: DRAFT_REVIEW,
    version: 1,
    publishedAt: null,
  },
  {
    id: "ruqyah-ayat-14",
    title: "آيات الرقية على مهل",
    authorId: "author-a",
    durationDays: 14,
    minutesPerDay: 10,
    summary: "آيات الرقية المأثورة مقسومة على يومين، مع دعاءين نبويين",
    contents: "يوم للنصف الأول من آيات الرقية ويوم للنصف الثاني، ومعها رقية النبي ﷺ ورقية جبريل عليه السلام.",
    days: repeatDays(14, (day) => [
      NOT_A_TREATMENT,
      ...(day % 2 === 1 ? ruqyahQuran.slice(0, half) : ruqyahQuran.slice(half)),
      ...ruqyahSunnah.slice(0, 2),
    ]),
    review: DRAFT_REVIEW,
    version: 1,
    publishedAt: null,
  },
  {
    id: "ruqyah-full-21",
    title: "آيات الرقية والأدعية النبوية",
    authorId: "author-b",
    durationDays: 21,
    minutesPerDay: 25,
    summary: "آيات الرقية كاملة مع أدعية الرقية من السنة",
    contents: "آيات الرقية المأثورة كلها كل يوم، ثم أربعة أدعية ثابتة يرقي بها المسلم نفسه.",
    days: repeatDays(21, () => [NOT_A_TREATMENT, ...ruqyahQuran, ...ruqyahSunnah]),
    review: DRAFT_REVIEW,
    version: 1,
    publishedAt: null,
  },
  {
    id: "tumaninah-40",
    title: "أربعون يوماً من الطمأنينة",
    authorId: "author-a",
    durationDays: 40,
    minutesPerDay: 8,
    summary: "ورد قصير يتنقّل بين آيات الشفاء وأدعية الكرب والمعوذات",
    contents: "دورة من ثلاثة أيام: آيات الشفاء، ثم أدعية الهم والكرب، ثم الفاتحة وآية الكرسي والمعوذات.",
    days: repeatDays(40, (day) => [NOT_A_TREATMENT, ...[shifa, hamm, muawwidhat][(day - 1) % 3]]),
    review: DRAFT_REVIEW,
    version: 1,
    publishedAt: null,
  },
];

/** الترتيب بالمدة ثم أبجدياً — لا «الأفضل» ولا عدد المستخدمين (content-guardrails.md §2). */
const byDurationThenTitle = (a: Plan, b: Plan) => a.durationDays - b.durationDays || a.title.localeCompare(b.title, "ar");

/** الخطط التجريبية المضمَّنة — تُعرض حين لا تتوفر خطط منشورة من الخادم (دون إنترنت أو دون خادم). */
export const bundledPlans: Plan[] = [...allPlans].sort(byDurationThenTitle);

// الخطط المنشورة من الخادم (تُحدَّث من catalog.ts وتُحفظ للعمل دون إنترنت)
let remotePlans: Plan[] = [];
export const setRemotePlans = (list: Plan[]) => {
  remotePlans = [...list].sort(byDurationThenTitle);
};

/** ما يُعرض للاختيار: المنشور إن وُجد، وإلا التجريبي. والمستبدل لا يُبدأ فيه (يكمله من سجّل فيه فقط). */
export const listPlans = (): Plan[] => {
  const current = remotePlans.filter((p) => p.remote?.isCurrent !== false);
  return current.length > 0 ? current : bundledPlans;
};

/** @deprecated للاختبارات القديمة: الخطط المضمَّنة. */
export const plans = bundledPlans;

export const findPlan = (id: string | null | undefined) => remotePlans.find((p) => p.id === id) ?? bundledPlans.find((p) => p.id === id);
export const findAuthor = (id: string) => authors.find((a) => a.id === id);
export const planAuthor = (p: Plan): Author | undefined => p.remote?.author ?? findAuthor(p.authorId);
export const isDraft = (p: Plan) => !p.remote && (!findAuthor(p.authorId)?.consentRef || !p.review.shariaReviewer);

/** تحويل خطة الخادم إلى نموذج التطبيق: الآيات تُقرأ من المصحف المدقّق بمفتاحها، ومفتاح غير معروف يُسقط الخطة كلها. */
export function fromServerPlan(s: {
  id: string; title: string; summary: string; contents: string; durationDays: Duration; minutesPerDay: number; version: number;
  publishedAtUtc: string | null; safetyCheckedAtUtc: string | null; isCurrent: boolean;
  author: { id: string; displayName: string; bio: string; consentDate: string | null };
  days: { day: number; items: ({ kind: string; quranKey?: string; title?: string; text?: string; source?: string; note?: string | null; repeat: number })[] }[];
}): Plan | null {
  const days: PlanDay[] = [];
  for (const d of s.days) {
    const items: WirdItem[] = [];
    for (const i of d.items) {
      if (i.kind === "Quran") {
        const p = i.quranKey ? quran[i.quranKey as QuranKey] : undefined;
        if (!p) return null;
        items.push({ kind: "quran", key: i.quranKey as QuranKey, ref: { surah: p.surah, fromAyah: p.from, toAyah: p.to }, title: i.title ?? p.surahName, note: i.note ?? undefined, repeat: i.repeat });
      } else if (i.kind === "Dhikr" && i.text && i.source) {
        items.push({ kind: "dhikr", title: i.title ?? "", text: i.text, source: i.source, note: i.note ?? undefined, repeat: i.repeat });
      } else if (i.kind === "Note" && i.text) {
        items.push({ kind: "note", text: i.text });
      } else {
        return null;
      }
    }
    days.push({ day: d.day, items });
  }
  if (days.length !== s.durationDays) return null;
  const author: Author = { id: s.author.id, displayName: s.author.displayName, bio: s.author.bio, consentRef: "server", consentDate: s.author.consentDate };
  return {
    id: s.id, title: s.title, authorId: author.id, durationDays: s.durationDays, minutesPerDay: s.minutesPerDay, summary: s.summary,
    contents: s.contents, days, review: { shariaReviewer: "server", safetyCheckedAt: s.safetyCheckedAtUtc }, version: s.version,
    publishedAt: s.publishedAtUtc, remote: { author, isCurrent: s.isCurrent },
  };
}
