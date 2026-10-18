import type { QuranKey } from "../quran";

/*
  وضع السكينة — لمن يشعر بضيق مفاجئ أو فزع ليلي أو أرق: ذكر بتمهّل، وآيات وأدعية بصوت هادئ.
  مشترك بين الويب وتطبيق Flutter (ADR-0023): يُصدَّر إلى JSON بـ scripts/export-dart.mjs.
*/
export type SakinaNeed = "distress" | "night" | "sleep";

export const SAKINA_NEEDS: Record<SakinaNeed, { label: string; items: string[]; verses: QuranKey[] }> = {
  distress: { label: "ضيق مفاجئ", items: ["dua-karb", "dhunnun", "ya-hayy"], verses: ["baqarah-248", "tawbah-26", "tawbah-40", "fath-4", "fath-18", "fath-26", "raad-28"] },
  night: { label: "استيقظت فزعاً", items: ["faza", "bad-dream"], verses: ["kursi", "falaq", "nas"] },
  sleep: { label: "لا أستطيع النوم", items: ["bismika", "sleep-nafth"], verses: ["kursi", "baqarah-285-286", "ikhlas", "falaq", "nas"] },
};

/** ترتيب الحالات في الشاشة. */
export const SAKINA_NEED_ORDER: SakinaNeed[] = ["distress", "night", "sleep"];

/** كم مرة تتكرر قائمة الآيات عند الاستماع. */
export const SAKINA_REPEAT = 3;

/*
  ذكر بتمهّل بدل تمارين التنفّس: الدائرة تنبض نبضاً هادئاً يضبط إيقاع الترديد،
  والعدّ بلمسة كالمسبحة — لا عدّ آلي ولا أي طقس، ذكر مأثور فقط بمصدره.
*/
export const PACED_DHIKR = [
  { text: "أستغفر الله", source: "صحيح مسلم (2702)" },
  { text: "لا إله إلا الله", source: "«أفضل الذكر لا إله إلا الله» — سنن الترمذي (3383)" },
  { text: "سبحان الله وبحمده", source: "صحيح البخاري (6405) وصحيح مسلم (2691)" },
  { text: "لا حول ولا قوة إلا بالله", source: "«كنز من كنوز الجنة» — صحيح البخاري (6384)" },
] as const;

export const PULSE_SECONDS = 5;
