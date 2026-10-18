import { quran, type QuranKey } from "../quran";

/*
  المحتوى الثابت لرفيق السكينة — أذكار وأدعية مأثورة ونصوص قرآنية فقط، كلٌّ بمصدره.
  قواعد صارمة (references/SKILL.md البنود 1–4 و.claude/skills/sanad-ruqyah-app/references/content-guardrails.md):
  - النص القرآني من المصحف المدقّق المشترك فقط (packages/shared/src/content/quran.ts) — لا يُكتب يدوياً.
  - لا "خطوات علاج" ولا وعد بنتيجة ولا تصنيف لحالة المستخدم؛ هذه عبادات وعادات يومية يختارها هو.
  - أي إضافة هنا تحتاج مراجعة مختص شرعي قبل الإطلاق (docs/adr/0022).
  - مشترك بين الويب وتطبيق Flutter (ADR-0023): يُصدَّر إلى JSON بـ scripts/export-dart.mjs — لا يُنسخ يدوياً.
*/

export interface Ayah {
  surah: number;
  ayah: number;
  surahName: string;
  text: string;
}

export function expandRef(key: QuranKey): Ayah[] {
  const p = quran[key];
  return p.ayat.map((text, i) => ({ surah: p.surah, ayah: p.from + i, surahName: p.surahName, text }));
}

export function refLabel(key: QuranKey) {
  const p = quran[key];
  return p.from === p.to ? `${p.surahName} ${p.from}` : `${p.surahName} ${p.from}–${p.to}`;
}

export type ItemKind = "verses" | "dhikr" | "practice";

export interface LibraryItem {
  id: string;
  kind: ItemKind;
  title: string;
  /** آيات (kind=verses) */
  refs?: QuranKey[];
  /** نص الذكر أو وصف العادة */
  text?: string;
  /** عدد التكرار الوارد فقط — لا نخترع أعداداً لم ترد */
  repeat?: number;
  /** فضل أو سياق قصير، بلا وعد بنتيجة */
  note?: string;
  source?: string;
  minutes?: number;
}

const items: LibraryItem[] = [
  // ——— قرآن ———
  {
    id: "fatiha", kind: "verses", title: "سورة الفاتحة", refs: ["fatiha"], minutes: 1,
    note: "قال النبي ﷺ لمن رقى بها: «وما يدريك أنها رقية».", source: "صحيح البخاري (5736)",
  },
  {
    id: "kursi", kind: "verses", title: "آية الكرسي", refs: ["kursi"], minutes: 1,
    note: "من قرأها إذا أوى إلى فراشه «لم يزل عليه من الله حافظ».", source: "صحيح البخاري (2311)",
  },
  {
    id: "baqarah-end", kind: "verses", title: "خاتمة سورة البقرة", refs: ["baqarah-285-286"], minutes: 2,
    note: "«من قرأ بالآيتين من آخر سورة البقرة في ليلة كفتاه».", source: "صحيح البخاري (5009) وصحيح مسلم (808)",
  },
  {
    id: "muawwidhat", kind: "verses", title: "المعوّذات", refs: ["ikhlas", "falaq", "nas"], repeat: 3, minutes: 2,
    note: "«قل هو الله أحد والمعوّذتين حين تمسي وحين تصبح ثلاث مرات تكفيك من كل شيء».", source: "سنن أبي داود (5082) وسنن الترمذي (3575)",
  },
  {
    id: "sakina-verses", kind: "verses", title: "آيات السكينة", refs: ["baqarah-248", "tawbah-26", "tawbah-40", "fath-4", "fath-18", "fath-26"], minutes: 3,
    note: "ذكر ابن القيم أن شيخه ابن تيمية كان يقرؤها إذا اشتدّت عليه الأمور.", source: "مدارج السالكين — منزلة السكينة",
  },
  {
    id: "tumaninah", kind: "verses", title: "آيات الطمأنينة", refs: ["raad-28", "yunus-57", "isra-82"], minutes: 1,
  },
  { id: "sharh", kind: "verses", title: "سورة الشرح", refs: ["sharh"], minutes: 1 },
  { id: "qalam-end", kind: "verses", title: "خاتمة سورة القلم", refs: ["qalam-51-52"], minutes: 1, note: "مما يقرؤه الرقاة في الرقية من العين." },

  // ——— أذكار وأدعية ———
  {
    id: "bismillah-3", kind: "dhikr", title: "ذكر الحفظ",
    text: "بسم الله الذي لا يضرّ مع اسمه شيءٌ في الأرض ولا في السماء، وهو السميع العليم",
    repeat: 3, note: "صباحاً ومساءً.", source: "سنن أبي داود (5088) وسنن الترمذي (3388)",
  },
  {
    id: "kalimat-tammat", kind: "dhikr", title: "الاستعاذة بكلمات الله",
    text: "أعوذ بكلمات الله التامّات من شرّ ما خلق", repeat: 3, note: "في المساء، وعند نزول أي مكان.", source: "صحيح مسلم (2708، 2709)",
  },
  {
    id: "dua-karb", kind: "dhikr", title: "دعاء الكرب",
    text: "لا إله إلا الله العظيم الحليم، لا إله إلا الله ربّ العرش العظيم، لا إله إلا الله ربّ السماوات وربّ الأرض وربّ العرش الكريم",
    source: "صحيح البخاري (6346) وصحيح مسلم (2730)",
  },
  {
    id: "dhunnun", kind: "dhikr", title: "دعوة ذي النون",
    text: "لا إله إلا أنت سبحانك إني كنتُ من الظالمين",
    note: "«لم يدعُ بها رجل مسلم في شيء قط إلا استجاب الله له».", source: "سنن الترمذي (3505)",
  },
  {
    id: "hamm-hazan", kind: "dhikr", title: "الاستعاذة من الهمّ والحزن",
    text: "اللهم إني أعوذ بك من الهمّ والحزن، والعجز والكسل، والبخل والجبن، وضَلَع الدَّين وغلبة الرجال",
    source: "صحيح البخاري (6369)",
  },
  {
    id: "ibn-masud", kind: "dhikr", title: "دعاء ذهاب الهمّ",
    text: "اللهم إني عبدك، ابن عبدك، ابن أمتك، ناصيتي بيدك، ماضٍ فيّ حكمك، عدلٌ فيّ قضاؤك، أسألك بكل اسمٍ هو لك سمّيت به نفسك، أو أنزلته في كتابك، أو علّمته أحداً من خلقك، أو استأثرت به في علم الغيب عندك، أن تجعل القرآن ربيع قلبي، ونور صدري، وجلاء حزني، وذهاب همّي",
    source: "مسند أحمد (3712)، وصحّحه الألباني",
  },
  {
    id: "ya-hayy", kind: "dhikr", title: "الاستغاثة برحمة الله",
    text: "يا حيّ يا قيّوم برحمتك أستغيث، أصلح لي شأني كلّه، ولا تكلني إلى نفسي طرفة عين",
    source: "رواه النسائي في عمل اليوم والليلة والحاكم، وحسّنه الألباني",
  },
  {
    id: "sayyid-istighfar", kind: "dhikr", title: "سيّد الاستغفار",
    text: "اللهم أنت ربي لا إله إلا أنت، خلقتني وأنا عبدك، وأنا على عهدك ووعدك ما استطعت، أعوذ بك من شرّ ما صنعت، أبوء لك بنعمتك عليّ، وأبوء بذنبي فاغفر لي، فإنه لا يغفر الذنوب إلا أنت",
    source: "صحيح البخاري (6306)",
  },
  {
    id: "istighfar-100", kind: "dhikr", title: "الاستغفار", text: "أستغفر الله", repeat: 100,
    note: "قال ﷺ: «وإني لأستغفر الله في اليوم مائة مرة».", source: "صحيح مسلم (2702)",
  },
  {
    id: "hand-on-pain", kind: "dhikr", title: "الرقية بوضع اليد",
    text: "ضع يدك على موضع الألم وقل: «بسم الله» ثلاثاً، ثم قل سبع مرات: «أعوذ بالله وقدرته من شرّ ما أجد وأحاذر»",
    source: "صحيح مسلم (2202)",
  },
  {
    id: "ruqyah-nabawiyyah", kind: "dhikr", title: "رقية النبي ﷺ",
    text: "اللهم ربّ الناس، أذهب البأس، اشفِ أنت الشافي، لا شفاء إلا شفاؤك، شفاءً لا يغادر سقماً",
    source: "صحيح البخاري (5743) وصحيح مسلم (2191)",
  },
  {
    id: "ruqyah-jibril", kind: "dhikr", title: "رقية جبريل عليه السلام",
    text: "بسم الله أرقيك، من كل شيء يؤذيك، من شرّ كل نفسٍ أو عين حاسد، الله يشفيك، بسم الله أرقيك",
    note: "تُقال لمن ترقيه من أهلك.", source: "صحيح مسلم (2186)",
  },
  {
    id: "children", kind: "dhikr", title: "تعويذ الأطفال",
    text: "أُعيذكما بكلمات الله التامّة، من كل شيطانٍ وهامّة، ومن كل عينٍ لامّة",
    note: "كان النبي ﷺ يعوّذ بها الحسن والحسين — وللواحد: «أُعيذك».", source: "صحيح البخاري (3371)",
  },
  {
    id: "tabreek", kind: "dhikr", title: "التبريك عند الإعجاب",
    text: "ما شاء الله، اللهم بارك فيه",
    note: "قال ﷺ لمن أعجبه شيء من أخيه: «هلّا برّكت». عادة لطيفة تحفظ بها نفسك وغيرك.", source: "سنن ابن ماجه (3509)، وموطأ مالك",
  },
  {
    id: "sleep-nafth", kind: "dhikr", title: "النفث قبل النوم",
    text: "اجمع كفّيك، واقرأ فيهما الإخلاص والمعوّذتين، ثم انفث فيهما وامسح بهما ما استطعت من جسدك، مبتدئاً برأسك ووجهك — ثلاث مرات",
    source: "صحيح البخاري (5017)",
  },
  { id: "bismika", kind: "dhikr", title: "ذكر النوم", text: "باسمك اللهم أموت وأحيا", source: "صحيح البخاري (6324)" },
  {
    id: "faza", kind: "dhikr", title: "عند الفزع من النوم",
    text: "أعوذ بكلمات الله التامّة من غضبه وعقابه وشرّ عباده، ومن همزات الشياطين وأن يحضرون",
    source: "سنن أبي داود (3893) وسنن الترمذي (3528)",
  },
  {
    id: "bad-dream", kind: "dhikr", title: "إذا رأيت ما تكره في المنام",
    text: "انفث عن يسارك ثلاثاً، واستعذ بالله من الشيطان ثلاثاً، وتحوّل عن جنبك الذي كنت عليه، ولا تحدّث بها أحداً",
    source: "صحيح مسلم (2261، 2262)",
  },

  // ——— عادات مساندة (أخذ بالأسباب، بلا أي ادعاء علاجي) ———
  {
    id: "slow-dhikr", kind: "practice", title: "ذكر بتمهّل ٣ دقائق", minutes: 3,
    text: "اجلس بهدوء، وردّد «أستغفر الله» أو «لا إله إلا الله» بتمهّل وحضور قلب. تجد دائرة تضبط لك الإيقاع في «سكينة».",
  },
  {
    id: "screens-off", kind: "practice", title: "إطفاء الشاشات قبل النوم",
    text: "أبعد الهاتف قبل النوم بنصف ساعة، واجعل آخر ما تسمعه أذكار النوم.",
  },
  { id: "sun-walk", kind: "practice", title: "مشي ١٥ دقيقة في الضوء", minutes: 15, text: "حركة خفيفة في ضوء النهار — من أبسط ما يُعين على النوم والمزاج." },
  { id: "gratitude", kind: "practice", title: "ثلاث نِعَم", text: "اكتب ثلاث نعم لاحظتها اليوم، واحمد الله عليها." },
  {
    id: "intention", kind: "practice", title: "النية واليقين",
    text: "الرقية والأذكار عبادة وتوكّل على الله، لا طقس سحري. ابدأ بنية التحصين والقرب من الله، وأحسن الظن به.",
  },
  {
    id: "medical-check", kind: "practice", title: "خذ بالأسباب الطبية",
    text: "إن استمرّ الأرق أو الإرهاق أو القلق أكثر من أسبوعين، فاستشر طبيباً — أعراض كثيرة لها أسباب عضوية أو نفسية قابلة للفحص. «تداووا عباد الله».",
    source: "سنن أبي داود (3855) وسنن الترمذي (2038)",
  },
  { id: "reflect", kind: "practice", title: "وقفة مع نفسك", text: "سجّل حالتك في «مذكّرتي» — دقيقة واحدة تكفي لترى كيف تتغيّر أيامك." },
  { id: "self-ruqyah", kind: "practice", title: "جلسة رقية ذاتية", minutes: 10, text: "اتبع المرشد خطوة بخطوة: نية، ثم آيات وأدعية مأثورة بتلاوة مسموعة." },
];

export const LIBRARY: Record<string, LibraryItem> = Object.fromEntries(items.map((i) => [i.id, i]));

export function item(id: string): LibraryItem {
  const found = LIBRARY[id];
  if (!found) throw new Error(`عنصر غير معروف: ${id}`);
  return found;
}
