import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShareButton } from "../../components/companion";
import { Badge, Card, Input, PageHeader } from "../../components/ui";
import { item } from "../../content/library";
import { MYTHS, VERDICT_META, searchMyths, type Myth, type Verdict } from "@sanad/shared/content/companion/myths";
import { programById } from "../../content/programs";
import { MAX_SCORE, QUIZ, evaluateQuiz } from "@sanad/shared/content/companion/quiz";
import { cx } from "../../lib/cx";
import { arNum } from "../../lib/dates";
import { useCompanion } from "../../stores/companion";

const SUGGESTIONS = ["ملح الهملايا", "الخرزة الزرقاء", "قانون الجذب", "الشاكرات", "اسم الأم", "الأبراج"];

/** «ميزان الوعي» — هل هذا صحيح شرعاً؟ */
export function AwarenessPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const results = useMemo(() => (q.trim() ? searchMyths(q) : MYTHS), [q]);
  const shown = filter === "all" ? results : results.filter((m) => m.verdict === filter);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="ميزان الوعي: هل هذا صحيح؟"
        subtitle="سمعت عن ممارسة لـ«الطاقة» أو «الحماية» ولا تعرف حكمها؟ اكتبها هنا، وسيظهر لك الحكم الشرعي بدليله، والتفسير العلمي والنفسي، والبديل الصحيح — بهدوء ودون تخويف."
      />
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
        <label htmlFor="myth-q" className="sr-only">ابحث عن ممارسة</label>
        <Input
          id="myth-q"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder="مثال: التبخير بملح الهملايا لطرد الطاقة السلبية"
          className="rounded-2xl py-4 ps-5 text-lg shadow-sm"
          autoComplete="off"
        />
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setParams({ q: s }, { replace: true })} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-muted hover:text-text">
            {s}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-1" role="tablist" aria-label="تصفية حسب الحكم">
        {(["all", "prohibited", "baseless", "detail", "legit"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={filter === v}
            onClick={() => setFilter(v)}
            className={cx("rounded-full px-3 py-1.5 text-sm font-semibold", filter === v ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
          >
            {v === "all" ? "الكل" : VERDICT_META[v].label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3" aria-live="polite">
        {shown.map((m) => <MythCard key={m.id} myth={m} defaultOpen={Boolean(q.trim()) && shown[0] === m} />)}
        {shown.length === 0 && (
          <Card className="text-center">
            <p className="font-bold">لم نجد هذه الممارسة في الميزان بعد</p>
            <p className="mt-2 text-sm leading-7 text-muted">
              القاعدة العامة: كل ما يُعتقد أنه ينفع أو يدفع الضرّ بذاته — من خرز أو أحجار أو «طاقة» — بلا دليل شرعي ولا تجربة علمية، فاجتنبه. وللفتوى في
              مسألتك اسأل أهل العلم الموثوقين.
            </p>
          </Card>
        )}
      </div>

      <p className="mt-8 text-center text-xs leading-6 text-muted">
        محتوى توعوي عام مبني على نصوص معروفة ومصادرها — ليس فتوى في حالة بعينها. راجعه مختصون قبل النشر، ونرحّب بتصويباتكم عبر صفحة البلاغات.
      </p>

      <Link to="/awareness/quiz" className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-dawn px-5 py-4">
        <div>
          <p className="font-bold">اختبر وعيك</p>
          <p className="text-sm text-muted">هل ممارساتك اليومية صحية أم مدخل للوهم؟ ٩ أسئلة سريعة.</p>
        </div>
        <span className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">ابدأ</span>
      </Link>
    </div>
  );
}

const toneColor: Record<string, string> = { danger: "var(--danger)", warning: "var(--warning)", neutral: "var(--sky-strong)", success: "var(--success)" };

function MythCard({ myth, defaultOpen }: { myth: Myth; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const meta = VERDICT_META[myth.verdict];
  const reduce = useReducedMotion();
  const alt = myth.alternativeItemId ? item(myth.alternativeItemId) : null;
  const altLink = alt?.id === "self-ruqyah" ? "/self-ruqyah" : alt ? `/programs` : null;
  return (
    <Card as="article" className="overflow-hidden p-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-start">
        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: toneColor[meta.tone] }} aria-hidden />
        <span className="flex-1 font-semibold leading-7">{myth.title}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={reduce ? false : { height: 0 }} animate={{ height: "auto" }} exit={reduce ? undefined : { height: 0 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-border p-5">
              <Section title="الحكم الشرعي" accent="var(--primary)">
                <p>{myth.shariah}</p>
                {myth.evidence && (
                  <blockquote className="mt-2 rounded-xl bg-surface-2 px-4 py-3">
                    <p className="naskh text-lg">{myth.evidence.text}</p>
                    <p className="mt-1 text-xs text-muted">{myth.evidence.source}</p>
                  </blockquote>
                )}
              </Section>
              <Section title="التفسير العلمي والنفسي" accent="var(--sky-strong)">
                <p>{myth.science}</p>
              </Section>
              <Section title="البديل الصحيح" accent="var(--success)">
                <p>{myth.alternative}</p>
                {alt && altLink && (
                  <Link to={altLink} className="mt-2 inline-block text-sm font-semibold text-primary">
                    ← {alt.title}
                  </Link>
                )}
              </Section>
              <div className="flex justify-end">
                <ShareButton
                  content={{ kicker: `هل هذا صحيح؟ — ${meta.label}`, body: `${myth.title}\n\n${myth.alternative}`, source: myth.evidence?.source }}
                  className="border border-border"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="leading-8">
      <h3 className="mb-1 text-sm font-bold" style={{ color: accent }}>{title}</h3>
      <div className="text-text/90">{children}</div>
    </section>
  );
}

/** «اختبر وعيك» — أداة مجانية قابلة للمشاركة، تنتهي بخطة تحصين مقترحة. */
export function QuizPage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const saveQuiz = useCompanion((s) => s.saveQuiz);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const finished = step >= QUIZ.length;
  const q = QUIZ[step];

  const choose = (score: number, idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    setAnswers((a) => ({ ...a, [q.id]: score }));
  };
  const next = () => {
    setPicked(null);
    const n = step + 1;
    setStep(n);
    if (n >= QUIZ.length) {
      const r = evaluateQuiz({ ...answers });
      saveQuiz({ score: r.score, programId: r.programId });
    }
  };

  if (finished) {
    const r = evaluateQuiz(answers);
    const program = programById(r.programId)!;
    return (
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm font-semibold text-primary">نتيجتك</p>
        <h1 className="mt-2 text-4xl font-bold">{r.tier.title}</h1>
        <p className="num mt-2 text-muted">{arNum(r.score)} من {arNum(MAX_SCORE)}</p>
        <p className="mx-auto mt-4 max-w-md leading-8">{r.tier.message}</p>
        <Card className="mt-8 text-start">
          <p className="text-sm text-muted">خطة التحصين المقترحة لك</p>
          <h2 className="mt-1 text-xl font-bold">{program.title}</h2>
          <p className="text-sm font-semibold text-primary">{program.tagline}</p>
          <p className="mt-2 text-sm leading-7 text-muted">{r.reason}</p>
          <button type="button" onClick={() => navigate(`/programs/${program.id}`)} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">
            اطّلع على البرنامج وابدأ
          </button>
        </Card>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ShareButton
            content={{ kicker: "اختبرتُ وعيي في سند", body: `نتيجتي: ${r.tier.title}\nهل ممارساتك اليومية صحية أم مدخل للوهم؟ جرّب الاختبار.`, source: `${location.host}/awareness/quiz` }}
            className="border border-border bg-surface px-4 py-2 text-sm"
          />
          <button type="button" onClick={() => { setAnswers({}); setStep(0); }} className="rounded-full px-4 py-2 text-sm text-muted hover:text-text">
            أعد الاختبار
          </button>
        </div>
        <p className="mt-8 text-xs text-muted">الاختبار يقيس عادات ووعياً عاماً، ولا يقيّم حالتك أو يصنّفها. لا تُرسل إجاباتك لأي مكان.</p>
      </div>
    );
  }

  const myth = q.mythId ? MYTHS.find((m) => m.id === q.mythId) : undefined;
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-primary">اختبر وعيك</p>
      <div className="mt-3 flex gap-1" aria-hidden>
        {QUIZ.map((x, i) => (
          <span key={x.id} className={cx("h-1.5 flex-1 rounded-full", i < step ? "bg-primary" : i === step ? "bg-primary/50" : "bg-border")} />
        ))}
      </div>
      <p className="num mt-2 text-xs text-muted">السؤال {arNum(step + 1)} من {arNum(QUIZ.length)}</p>
      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={reduce ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: 24 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="mt-6 text-2xl font-bold leading-10">{q.question}</h1>
          <div className="mt-6 flex flex-col gap-3">
            {q.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                onClick={() => choose(o.score, i)}
                disabled={picked !== null}
                className={cx(
                  "rounded-2xl border px-5 py-4 text-start font-semibold transition-colors",
                  picked === null && "border-border bg-surface hover:border-primary",
                  picked === i && o.score === 2 && "border-success bg-success-bg",
                  picked === i && o.score < 2 && "border-sky-strong bg-sky",
                  picked !== null && picked !== i && "border-border bg-surface opacity-60",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {picked !== null && (
            <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl bg-dawn p-4">
              {myth ? (
                <>
                  <p className="text-sm font-bold">{VERDICT_META[myth.verdict].label}: {myth.title}</p>
                  <p className="mt-1 text-sm leading-7 text-muted">{myth.alternative}</p>
                </>
              ) : (
                <p className="text-sm leading-7 text-muted">كل خطوة صغيرة ثابتة أفضل من كثير متقطّع. سنقترح عليك خطة بسيطة في النهاية.</p>
              )}
              <button type="button" onClick={next} className="mt-3 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">
                {step + 1 === QUIZ.length ? "اعرض نتيجتي" : "التالي"}
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
