import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ItemView, ProgressBar, TapCounter } from "../../components/companion";
import { Button } from "../../components/ui";
import { item, type LibraryItem } from "../../content/library";
import { cx } from "../../lib/cx";
import { arNum } from "../../lib/dates";
import { useJournal } from "../../stores/journal";

/*
  المرشد التفاعلي للرقية الذاتية — يقود المستخدم خطوة بخطوة بما ورد فقط:
  نية، وضع اليد، آيات بتلاوة مسموعة وتكرار تلقائي، أدعية نبوية، ثم النفث.
  ليس «خطوات علاج» ولا وعداً بنتيجة (البند 4)؛ هو تعليم لعبادة مشروعة يؤديها المرء بنفسه.
*/
type Mode = "self" | "family" | "child";

interface Step {
  id: string;
  title: string;
  hint: string;
  items?: string[];
  custom?: "intention" | "hand" | "nafth";
}

function stepsFor(mode: Mode): Step[] {
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

const MODES: Array<{ id: Mode; title: string; sub: string }> = [
  { id: "self", title: "أرقي نفسي", sub: "جلسة لك وحدك" },
  { id: "family", title: "أرقي أحد أهلي", sub: "والدك، زوجك، أخوك…" },
  { id: "child", title: "أرقي طفلي", sub: "بأدعية النبي ﷺ للأطفال" },
];

export function SelfRuqyahPage() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [before, setBefore] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const [finished, setFinished] = useState(false);
  const reduce = useReducedMotion();

  if (!mode) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-primary">المرشد التفاعلي</p>
        <h1 className="mt-1 text-3xl font-bold">ارقِ نفسك وأهلك بنفسك</h1>
        <p className="mt-3 leading-8 text-muted">
          لا تحتاج وسيطاً: كان النبي ﷺ يرقي نفسه وأهله. سنقودك خطوة بخطوة بآيات وأدعية مأثورة فقط، بخط واضح وتلاوة تسمعها لتصحيح قراءتك.
          تستغرق الجلسة نحو ١٠ دقائق.
        </p>
        <Calmness label="قبل أن تبدأ — ما مستوى هدوئك الآن؟ (اختياري)" value={before} onChange={setBefore} />
        <p className="mt-8 text-sm font-semibold">من سترقي اليوم؟</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} className="rounded-2xl border border-border bg-surface p-5 text-start transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
              <p className="text-lg font-bold">{m.title}</p>
              <p className="mt-1 text-sm text-muted">{m.sub}</p>
            </button>
          ))}
        </div>
        <p className="mt-8 text-xs leading-6 text-muted">
          الرقية عبادة ودعاء، والشفاء بيد الله وحده. إن كان الألم شديداً أو مستمراً فراجع طبيباً — الأخذ بالأسباب لا ينافي الرقية.
        </p>
      </div>
    );
  }

  const steps = stepsFor(mode);
  const step = steps[i];

  if (finished) return <Finish before={before} onRestart={() => { setMode(null); setI(0); setFinished(false); setBefore(null); }} />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => (i === 0 ? setMode(null) : setI(i - 1))} className="font-semibold text-primary">→ رجوع</button>
        <span className="num text-muted">الخطوة {arNum(i + 1)} من {arNum(steps.length)}</span>
      </div>
      <div className="mt-3">
        <ProgressBar value={(i + 1) / steps.length} label="تقدّم الجلسة" />
      </div>
      <AnimatePresence mode="wait">
        <motion.section
          key={step.id}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="mt-6 rounded-3xl border border-border bg-surface p-6 md:p-8"
          aria-labelledby="step-title"
        >
          <p className="text-sm text-muted">{step.hint}</p>
          <h1 id="step-title" className="mt-1 text-2xl font-bold">{step.title}</h1>
          <div className="mt-6 flex flex-col gap-8">
            {step.custom === "intention" && <Intention />}
            {step.custom === "hand" && <HandStep />}
            {step.custom === "nafth" && <ItemView item={item("sleep-nafth")} large />}
            {step.items?.map((id) => <ItemView key={id} item={item(id)} large />)}
          </div>
        </motion.section>
      </AnimatePresence>
      <div className="sticky bottom-4 mt-6 flex gap-3">
        <Button className="flex-1 py-3 text-base shadow-lg" onClick={() => (i + 1 < steps.length ? setI(i + 1) : setFinished(true))}>
          {i + 1 < steps.length ? "الخطوة التالية" : "أتممت الجلسة"}
        </Button>
      </div>
    </div>
  );
}

function Intention() {
  const tips = [
    "استحضر أن الشافي هو الله وحده، والرقية سبب ودعاء.",
    "يُستحب أن تكون على وضوء، في مكان هادئ.",
    "لا يلزم ماء ولا زيت ولا أي أداة — يكفيك كلام الله وصوتك.",
    "اقرأ بصوت مسموع لك، بتمهّل وتدبّر.",
  ];
  return (
    <ul className="flex flex-col gap-3">
      {tips.map((t) => (
        <li key={t} className="flex gap-3 rounded-2xl bg-surface-2 px-4 py-3 leading-7">
          <span className="text-primary" aria-hidden>✦</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function HandStep() {
  const it: LibraryItem = item("hand-on-pain");
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r="56" fill="var(--sky)" />
        <path d="M44 86V54a6 6 0 0 1 12 0v-14a6 6 0 0 1 12 0v12a6 6 0 0 1 12 0v6a6 6 0 0 1 12 0v14c0 12-8 20-22 20h-6c-10 0-16-4-20-6Z" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <p className="max-w-md leading-8 text-muted">{it.text}</p>
      <div className="grid w-full max-w-md gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="naskh text-2xl">بسم الله</p>
          <div className="mt-3 flex justify-center"><TapCounter target={3} /></div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="naskh text-xl">أعوذ بالله وقدرته من شرّ ما أجد وأحاذر</p>
          <div className="mt-3 flex justify-center"><TapCounter target={7} /></div>
        </div>
      </div>
      <p className="text-xs text-muted">المصدر: {it.source}</p>
    </div>
  );
}

function Calmness({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cx("num h-10 w-10 rounded-full border text-sm font-semibold", value === n ? "border-primary bg-primary text-primary-contrast" : "border-border bg-surface")}
          >
            {arNum(n)}
          </button>
        ))}
      </div>
      <div className="mt-1 flex max-w-[506px] justify-between text-xs text-muted">
        <span>متوتر جداً</span>
        <span>مطمئن تماماً</span>
      </div>
    </fieldset>
  );
}

function Finish({ before, onRestart }: { before: number | null; onRestart: () => void }) {
  const [after, setAfter] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const addSession = useJournal((s) => s.addSession);
  const unlocked = useJournal((s) => s.unlocked);
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sage text-3xl" aria-hidden>🌿</div>
      <h1 className="mt-4 text-3xl font-bold">تقبّل الله منك</h1>
      <p className="mt-2 leading-8 text-muted">أتممت جلستك. الثبات على القليل خير من الكثير المنقطع — نلقاك غداً بإذن الله.</p>
      {before !== null && !saved && (
        <div className="text-start">
          <Calmness label="وما مستوى هدوئك الآن؟" value={after} onChange={setAfter} />
          {after !== null && (
            <Button
              className="mt-4"
              onClick={async () => {
                await addSession({ at: new Date().toISOString(), kind: "ruqyah", before, after });
                setSaved(true);
              }}
            >
              احفظ في مذكّرتي
            </Button>
          )}
        </div>
      )}
      {saved && (
        <p className="mt-6 rounded-xl bg-success-bg px-4 py-2 text-sm text-success">
          {unlocked ? "حُفظ في مذكّرتك ✓" : "سيُحفظ في مذكّرتك عند فتحها في هذه الجلسة."}
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/today" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">العودة ليومي</Link>
        <button type="button" onClick={onRestart} className="rounded-xl border border-border px-5 py-3 font-semibold">جلسة جديدة</button>
      </div>
    </div>
  );
}
