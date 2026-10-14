/*
  «اختبر وعيك» — اختبار قصير قابل للمشاركة يقيس عادات ووعياً، لا حالة الشخص.
  لا يسأل عن أعراض ولا يستنتج تصنيفاً (references/SKILL.md البند 2)؛ نتيجته اقتراح برنامج يختاره المستخدم بنفسه.
*/

export type QuizArea = "habits" | "awareness" | "selfReliance" | "sleep" | "balance";

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
    id: "q-symptoms", area: "balance", question: "شعرت بإرهاق وأرق أسبوعين متتاليين. ما أول ما تفعله؟", mythId: "every-symptom",
    options: [
      { label: "إنها عين بالتأكيد — أبحث عن راقٍ", score: 0 },
      { label: "أتجاهل الأمر حتى يزول", score: 1 },
      { label: "أرقي نفسي وأراجع طبيباً معاً", score: 2 },
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

export function evaluateQuiz(answers: Record<string, number>): QuizResult {
  const score = QUIZ.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
  const ratio = score / MAX_SCORE;
  const tier =
    ratio >= 0.8
      ? { title: "وعيٌ راسخ", message: "عاداتك متّزنة وبعيدة عن فخاخ الوهم. ثبّتها بوِرد يومي، وشارك ما تعرفه مع من تحب." }
      : ratio >= 0.5
        ? { title: "على الطريق الصحيح", message: "عندك أساس جيد، وبعض العادات تحتاج ضبطاً بسيطاً. أسبوع واحد يكفي لتبدأ الفرق." }
        : { title: "بداية جديدة", message: "كثيرون يقعون في هذه الفخاخ دون قصد — المهم أنك عرفت الآن. ابدأ بخطوات صغيرة وثابتة." };

  const area = (a: QuizArea) => QUIZ.filter((q) => q.area === a).reduce((s, q) => s + (answers[q.id] ?? 0), 0);
  let programId = "foundation-7";
  let reason = "لتثبيت وِرد التحصين اليومي أولاً.";
  if (area("sleep") === 0) {
    programId = "quiet-nights-14";
    reason = "لأن روتين ما قبل النوم هو أسرع ما يمكن تحسينه.";
  } else if (area("selfReliance") === 0) {
    programId = "self-ruqyah-21";
    reason = "لتتعلّم أن ترقي نفسك وأهلك بلا وسيط.";
  } else if (area("balance") === 0) {
    programId = "calm-heart-10";
    reason = "لتجمع بين الأذكار والأخذ بالأسباب في الأيام المثقلة.";
  } else if (ratio >= 0.8) {
    programId = "self-ruqyah-21";
    reason = "خطوتك التالية: أن تصبح مرجع أهلك في الرقية الذاتية.";
  }
  return { score, tier, programId, reason };
}
