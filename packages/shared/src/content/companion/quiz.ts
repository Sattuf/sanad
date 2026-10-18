/*
  «اختبر وعيك» — اختبار قصير قابل للمشاركة يقيس عادات ووعياً، لا حالة الشخص.
  لا يسأل عن أعراض ولا يستنتج تصنيفاً (references/SKILL.md البند 2)؛ نتيجته اقتراح برنامج يختاره المستخدم بنفسه.
*/

export type QuizArea = "habits" | "awareness" | "selfReliance" | "sleep";

export interface QuizQuestion {
  id: string;
  area: QuizArea;
  question: string;
  options: Array<{ label: string; score: 0 | 1 | 2 }>;
  /** بطاقة «ميزان الوعي» المرتبطة تُعرض بعد الإجابة */
  mythId?: string;
}

export const QUIZ: QuizQuestion[] = [
  {
    id: "q-tabreek", area: "habits", question: "حين يعجبك شيء عند غيرك، ماذا تفعل عادة؟", mythId: "tabreek",
    options: [
      { label: "أقول: ما شاء الله، اللهم بارك", score: 2 },
      { label: "لا أقول شيئاً", score: 1 },
      { label: "أتجنّب النظر خوفاً من أن أحسده", score: 0 },
    ],
  },
  {
    id: "q-amulet", area: "awareness", question: "ما رأيك في تعليق «الخرزة الزرقاء» في السيارة أو البيت؟", mythId: "amulets",
    options: [
      { label: "أعلّقها احتياطاً، لن تضر", score: 0 },
      { label: "لا أعلّقها، لكن لا أرى بها بأساً", score: 1 },
      { label: "أتجنّبها وأتحصّن بالأذكار", score: 2 },
    ],
  },
  {
    id: "q-adhkar", area: "habits", question: "أذكار الصباح والمساء في يومك:",
    options: [
      { label: "ثابتة كل يوم", score: 2 },
      { label: "أحياناً", score: 1 },
      { label: "نادراً أو لا أعرفها", score: 0 },
    ],
  },
  {
    id: "q-universe", area: "awareness", question: "محتوى «اطلب من الكون» و«ارفع ذبذباتك» على السوشيال ميديا:", mythId: "law-of-attraction",
    options: [
      { label: "أطبّقه وأشعر أنه ينفع", score: 0 },
      { label: "أشاهده للتحفيز فقط", score: 1 },
      { label: "أعرف إشكاله وأستبدله بالدعاء والتوكّل", score: 2 },
    ],
  },
  {
    id: "q-mother-name", area: "awareness", question: "راقٍ طلب منك اسم والدتك وقطعة من ملابسك. ماذا تفعل؟", mythId: "mother-name",
    options: [
      { label: "أعطيه ما طلب، هو أعلم", score: 0 },
      { label: "أتردّد لكن قد أعطيه", score: 1 },
      { label: "أنصرف — هذه علامة دجل", score: 2 },
    ],
  },
  {
    id: "q-self", area: "selfReliance", question: "هل تستطيع أن ترقي نفسك أو طفلك بنفسك؟", mythId: "self-ruqyah",
    options: [
      { label: "لا، أحتاج دائماً لراقٍ", score: 0 },
      { label: "أعرف القليل ولست واثقاً", score: 1 },
      { label: "نعم، بما ورد في السنّة", score: 2 },
    ],
  },
  {
    id: "q-horoscope", area: "awareness", question: "الأبراج وحظّك اليوم:", mythId: "horoscopes",
    options: [
      { label: "أتابعها وأتأثّر بها", score: 0 },
      { label: "أقرؤها للتسلية فقط", score: 1 },
      { label: "لا أتابعها", score: 2 },
    ],
  },
  {
    id: "q-sleep", area: "sleep", question: "آخر ما تفعله قبل النوم:",
    options: [
      { label: "أتصفّح الهاتف حتى أغفو", score: 0 },
      { label: "أذكار النوم أحياناً", score: 1 },
      { label: "آية الكرسي والمعوّذات بانتظام", score: 2 },
    ],
  },
];

export const MAX_SCORE = QUIZ.length * 2;

export interface QuizResult {
  score: number;
  tier: { title: string; message: string };
  programId: string;
  reason: string;
}

/** الشرائح بترتيب تنازلي — أول شريحة يبلغ المستخدم حدّها الأدنى (نسبة من الدرجة الكاملة). */
export const QUIZ_TIERS: Array<{ minRatio: number; title: string; message: string }> = [
  { minRatio: 0.8, title: "وعيٌ راسخ", message: "عاداتك متّزنة وبعيدة عن فخاخ الوهم. ثبّتها بوِرد يومي، وشارك ما تعرفه مع من تحب." },
  { minRatio: 0.5, title: "على الطريق الصحيح", message: "عندك أساس جيد، وبعض العادات تحتاج ضبطاً بسيطاً. أسبوع واحد يكفي لتبدأ الفرق." },
  { minRatio: 0, title: "بداية جديدة", message: "كثيرون يقعون في هذه الفخاخ دون قصد — المهم أنك عرفت الآن. ابدأ بخطوات صغيرة وثابتة." },
];

/**
 * قواعد الاقتراح بالترتيب: أول قاعدة تنطبق تفوز.
 * zeroArea = مجموع هذا المحور صفر، minRatio = النسبة الكلية لا تقل عن الحد، والقاعدة الأخيرة بلا شرط هي الافتراضية.
 */
export const QUIZ_RECOMMENDATIONS: Array<{ zeroArea?: QuizArea; minRatio?: number; programId: string; reason: string }> = [
  { zeroArea: "sleep", programId: "quiet-nights-14", reason: "لأن روتين ما قبل النوم هو أسرع ما يمكن تحسينه." },
  { zeroArea: "selfReliance", programId: "self-ruqyah-21", reason: "لتتعلّم أن ترقي نفسك وأهلك بلا وسيط." },
  { minRatio: 0.8, programId: "self-ruqyah-21", reason: "خطوتك التالية: أن تصبح مرجع أهلك في الرقية الذاتية." },
  { programId: "foundation-7", reason: "لتثبيت وِرد التحصين اليومي أولاً." },
];

export function evaluateQuiz(answers: Record<string, number>): QuizResult {
  const score = QUIZ.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
  const ratio = score / MAX_SCORE;
  const { title, message } = QUIZ_TIERS.find((t) => ratio >= t.minRatio)!;
  const area = (a: QuizArea) => QUIZ.filter((q) => q.area === a).reduce((s, q) => s + (answers[q.id] ?? 0), 0);
  const rec = QUIZ_RECOMMENDATIONS.find(
    (r) => (r.zeroArea === undefined || area(r.zeroArea) === 0) && (r.minRatio === undefined || ratio >= r.minRatio),
  )!;
  return { score, tier: { title, message }, programId: rec.programId, reason: rec.reason };
}
