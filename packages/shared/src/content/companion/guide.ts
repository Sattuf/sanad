/*
  المرشد التفاعلي للرقية الذاتية — يقود المستخدم خطوة بخطوة بما ورد فقط:
  نية، وضع اليد، آيات بتلاوة مسموعة وتكرار تلقائي، أدعية نبوية، ثم النفث.
  ليس «خطوات علاج» ولا وعداً بنتيجة (البند 4)؛ هو تعليم لعبادة مشروعة يؤديها المرء بنفسه.
  مشترك بين الويب وتطبيق Flutter (ADR-0023): يُصدَّر إلى JSON بـ scripts/export-dart.mjs.
*/
export type GuideMode = "self" | "family" | "child";

export interface GuideStep {
  id: string;
  title: string;
  hint: string;
  items?: string[];
  custom?: "intention" | "hand" | "nafth";
}

export function guideSteps(mode: GuideMode): GuideStep[] {
  return [
    { id: "intention", title: "النية وحضور القلب", hint: "قبل أن تبدأ", custom: "intention" },
    { id: "hand", title: mode === "self" ? "ضع يدك على موضع الألم" : "ضع يدك على موضع الألم عنده", hint: "من السنّة — صحيح مسلم", custom: "hand" },
    { id: "fatiha", title: "سورة الفاتحة", hint: "اقرأها بتدبّر، وكرّرها إن شئت", items: ["fatiha"] },
    { id: "kursi", title: "آية الكرسي", hint: "أعظم آية في كتاب الله", items: ["kursi"] },
    { id: "baqarah", title: "خاتمة سورة البقرة", hint: "«كفتاه»", items: ["baqarah-end"] },
    { id: "muawwidhat", title: "المعوّذات", hint: "ثلاث مرات", items: ["muawwidhat"] },
    {
      id: "dua",
      title: mode === "child" ? "تعويذ الطفل" : mode === "family" ? "رقية جبريل والنبي ﷺ" : "رقية النبي ﷺ",
      hint: "أدعية مأثورة",
      items: mode === "child" ? ["children", "ruqyah-nabawiyyah"] : mode === "family" ? ["ruqyah-jibril", "ruqyah-nabawiyyah"] : ["ruqyah-nabawiyyah", "dhunnun"],
    },
    { id: "nafth", title: "النفث والمسح", hint: "ختام الجلسة", custom: "nafth" },
  ];
}

export const GUIDE_MODES: Array<{ id: GuideMode; title: string; sub: string }> = [
  { id: "self", title: "أرقي نفسي", sub: "جلسة لك وحدك" },
  { id: "family", title: "أرقي أحد أهلي", sub: "والدك، زوجك، أخوك…" },
  { id: "child", title: "أرقي طفلي", sub: "بأدعية النبي ﷺ للأطفال" },
];

/** عنصر المكتبة لخطوة النفث في ختام الجلسة. */
export const GUIDE_NAFTH_ITEM = "sleep-nafth";

export const INTENTION_TIPS = [
  "استحضر أن الشافي هو الله وحده، والرقية سبب ودعاء.",
  "يُستحب أن تكون على وضوء، في مكان هادئ.",
  "لا يلزم ماء ولا زيت ولا أي أداة — يكفيك كلام الله وصوتك.",
  "اقرأ بصوت مسموع لك، بتمهّل وتدبّر.",
];

/** خطوة وضع اليد: نص الحديث من المكتبة، والذكران بعدّادهما كما وردا في صحيح مسلم (2202). */
export const HAND_STEP = {
  itemId: "hand-on-pain",
  phrases: [
    { text: "بسم الله", repeat: 3 },
    { text: "أعوذ بالله وقدرته من شرّ ما أجد وأحاذر", repeat: 7 },
  ],
} as const;
