import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ItemView, ProgressBar, ProgressRing, ShareButton } from "../../components/companion";
import { Button, Card, PageHeader } from "../../components/ui";
import { item } from "../../content/library";
import { PROGRAMS, SLOT_LABEL, TINT, programById, type Program, type ProgramTask, type Slot } from "../../content/programs";
import { cx } from "../../lib/cx";
import { arNum } from "../../lib/dates";
import { QUIZ } from "@sanad/shared/content/companion/quiz";
import { dailyReminderIcs, downloadText } from "../../lib/ics";
import { currentDay, dayProgress, programProgress, useCompanion } from "../../stores/companion";
import { NotFoundPage } from "../../app/NotFoundPage";

function ProgramArt({ program, size = 56 }: { program: Program; size?: number }) {
  const tint = TINT[program.tint];
  return (
    <div className="flex shrink-0 items-center justify-center rounded-2xl" style={{ width: size, height: size, background: tint.bg, color: tint.ink }} aria-hidden>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {program.tint === "teal" && <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />}
        {program.tint === "sky" && (
          <>
            <path d="M8 13c-2-1-3-3-3-5a7 7 0 0 1 14 0c0 2-1 4-3 5" />
            <path d="M9 17h6M10 21h4M12 13v4" />
          </>
        )}
        {program.tint === "sage" && <path d="M12 21c-4-3-8-6-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5-4 8-8 11Z" />}
        {program.tint === "sand" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
      </svg>
    </div>
  );
}

export function ProgramsPage() {
  const { activeProgramId, done, finished, quiz } = useCompanion();
  return (
    <div>
      <PageHeader
        title="برامج الالتزام"
        subtitle="بدل أن تتوه بين عشرات السور والأدعية: اختر برنامجاً واضحاً بمهام يومية صغيرة. كل ما فيه مأثور بمصدره، وعدد الأيام وسيلة للاستمرار لا وعدٌ بنتيجة."
      />
      {!quiz && (
        <Link to="/awareness/quiz" className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-dawn px-5 py-4">
          <div>
            <p className="font-bold">لا تعرف من أين تبدأ؟</p>
            <p className="text-sm text-muted">اختبار وعي من {arNum(QUIZ.length)} أسئلة يقترح عليك البرنامج الأنسب — دقيقتان فقط.</p>
          </div>
          <span className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">ابدأ الاختبار</span>
        </Link>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {PROGRAMS.map((p) => {
          const active = p.id === activeProgramId;
          const prog = programProgress(p.id, done);
          return (
            <Link key={p.id} to={`/programs/${p.id}`} className="group">
              <Card className={cx("h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md", active && "ring-2 ring-primary")}>
                <div className="flex items-start gap-4">
                  <ProgramArt program={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{p.title}</h2>
                      {active && <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success">برنامجك الحالي</span>}
                      {finished.includes(p.id) && <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-lamp">أتممته ✓</span>}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold" style={{ color: TINT[p.tint].ink }}>{p.tagline}</p>
                    <p className="mt-2 text-sm leading-7 text-muted">{p.description}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                      <span className="num">⏱ نحو {arNum(p.minutesPerDay)} دقيقة يومياً</span>
                      <span>· {p.forWhom}</span>
                    </div>
                    {active && <div className="mt-3"><ProgressBar value={prog.ratio} label={`تقدّم ${p.title}`} /></div>}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ProgramDetailPage() {
  const { id } = useParams();
  const program = programById(id);
  const { activeProgramId, startedOn, done, start } = useCompanion();
  const navigate = useNavigate();
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  if (!program) return <NotFoundPage />;
  const active = activeProgramId === program.id;
  const today = active ? currentDay(startedOn, program.days) : 0;
  const prog = programProgress(program.id, done);
  const sampleDay = program.plan[0];

  const begin = () => {
    start(program.id);
    navigate("/today");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/programs" className="text-sm font-semibold text-primary">→ كل البرامج</Link>
      <div className="mt-4 overflow-hidden rounded-3xl border border-border" style={{ background: TINT[program.tint].bg }}>
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:p-8">
          <ProgramArt program={program} size={88} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{program.title}</h1>
            <p className="mt-1 font-semibold" style={{ color: TINT[program.tint].ink }}>{program.tagline}</p>
            <p className="mt-3 leading-8 text-muted">{program.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Fact label="المدة" value={`${arNum(program.days)} يوماً`} />
        <Fact label="يومياً" value={`نحو ${arNum(program.minutesPerDay)} دقيقة`} />
        <Fact label="لمن؟" value={program.forWhom} />
      </div>

      <Card className="mt-6">
        <h2 className="font-bold">خريطة الأيام</h2>
        <p className="mt-1 text-sm text-muted">كل يوم يجمع وِرداً ثابتاً مع عادة جديدة. الأيام الفائتة تبقى مفتوحة — لا لوم، أكمل من حيث أنت.</p>
        <ol className="mt-4 grid grid-cols-7 gap-2" aria-label="أيام البرنامج">
          {program.plan.map((d) => {
            const r = dayProgress(program.id, d, done);
            const isToday = active && d.day === today;
            return (
              <li key={d.day} title={d.title}>
                <div
                  className={cx(
                    "num flex aspect-square items-center justify-center rounded-xl border text-sm font-semibold",
                    r.ratio === 1 ? "border-transparent bg-primary text-primary-contrast" : r.ratio > 0 ? "border-primary text-primary" : "border-border text-muted",
                    isToday && "ring-2 ring-lamp ring-offset-2 ring-offset-surface",
                  )}
                  aria-label={`اليوم ${d.day}: ${d.title}${r.ratio === 1 ? " — مكتمل" : ""}`}
                >
                  {arNum(d.day)}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card className="mt-6">
        <h2 className="font-bold">نموذج من اليوم الأول: {sampleDay.title}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {sampleDay.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="text-xs text-muted">{SLOT_LABEL[t.slot]}</span>
              <span className="font-semibold">{item(t.itemId).title}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur">
        {active ? (
          <>
            <ProgressRing value={prog.ratio}>{arNum(Math.round(prog.ratio * 100))}٪</ProgressRing>
            <p className="flex-1 text-sm text-muted">أنت في اليوم {arNum(today)} من {arNum(program.days)}.</p>
            <Link to="/today" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">متابعة اليوم</Link>
          </>
        ) : activeProgramId && !confirmSwitch ? (
          <>
            <p className="flex-1 text-sm text-muted">لديك برنامج قائم: {programById(activeProgramId)?.title}. تقدّمك فيه محفوظ إن عدت إليه.</p>
            <Button variant="secondary" onClick={() => setConfirmSwitch(true)}>بدّل إلى هذا البرنامج</Button>
          </>
        ) : (
          <>
            <p className="flex-1 text-sm text-muted">يُحفظ تقدّمك على جهازك فقط — بلا حساب ولا تسجيل.</p>
            <Button onClick={begin} className="px-6 py-3 text-base">ابدأ البرنامج اليوم</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 font-bold">{value}</p>
    </div>
  );
}

const SLOT_ORDER: Slot[] = ["anytime", "morning", "evening", "night"];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return { title: "ليلة هادئة", sub: "إن جافاك النوم، فالسكينة على بُعد لمسة." };
  if (h < 12) return { title: "صباح الخير", sub: "ابدأ يومك محصّناً بأذكار الصباح." };
  if (h < 17) return { title: "طاب يومك", sub: "دقائق قليلة تكفي لتبقى على وِردك." };
  if (h < 21) return { title: "مساء الخير", sub: "أذكار المساء في انتظارك." };
  return { title: "مساء السكينة", sub: "اختم يومك بأذكار النوم." };
}

export function TodayPage() {
  const { activeProgramId, startedOn, done, activeDays, toggle, finish } = useCompanion();
  const program = programById(activeProgramId);
  const g = greeting();
  const today = program ? currentDay(startedOn, program.days) : 1;
  const [viewDay, setViewDay] = useState<number | null>(null);
  const dayNum = viewDay ?? today;
  const day = program?.plan[dayNum - 1];
  const [openTask, setOpenTask] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const committedDays = Object.keys(activeDays).length;

  const grouped = useMemo(() => {
    const m = new Map<Slot, ProgramTask[]>();
    day?.tasks.forEach((t) => m.set(t.slot, [...(m.get(t.slot) ?? []), t]));
    return SLOT_ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [day]);

  if (!program || !day) {
    return (
      <div className="mx-auto max-w-2xl">
        <Header title={g.title} sub={g.sub} />
        <div className="mt-8 rounded-3xl border border-border bg-dawn p-8 text-center">
          <h2 className="text-2xl font-bold">ابدأ رحلتك بخطوة صغيرة</h2>
          <p className="mx-auto mt-2 max-w-md leading-8 text-muted">اختر برنامج التزام، وسيرتّب لك سند مهام يومية واضحة: ماذا تقرأ، ومتى، وكم مرة — مع مصدر كل ذكر.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/programs/foundation-7" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">ابدأ بـ«أساس التحصين» (٧ أيام)</Link>
            <Link to="/programs" className="rounded-xl border border-border bg-surface px-5 py-3 font-semibold">كل البرامج</Link>
          </div>
        </div>
        <QuickActions />
      </div>
    );
  }

  const dp = dayProgress(program.id, day, done);
  const pp = programProgress(program.id, done);
  const allDone = pp.ratio === 1;

  return (
    <div className="mx-auto max-w-3xl">
      <Header title={g.title} sub={g.sub} />

      <section className="mt-6 overflow-hidden rounded-3xl border border-border" style={{ background: TINT[program.tint].bg }} aria-label="تقدّمك">
        <div className="flex flex-wrap items-center gap-5 p-5 md:p-6">
          <ProgressRing value={dp.ratio} size={84} stroke={8} color={TINT[program.tint].ring}>
            <span className="num text-base">{arNum(dp.completed)}/{arNum(dp.total)}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{program.title} · اليوم {arNum(dayNum)} من {arNum(program.days)}</p>
            <h2 className="text-2xl font-bold">{day.title}</h2>
            <div className="mt-3 max-w-sm">
              <ProgressBar value={pp.ratio} color={TINT[program.tint].ring} label="تقدّم البرنامج كاملاً" />
            </div>
          </div>
          <div className="text-center">
            <p className="num text-3xl font-bold" style={{ color: TINT[program.tint].ink }}>{arNum(committedDays)}</p>
            <p className="text-xs text-muted">أيام التزام</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border/60 bg-surface/50 px-3 py-2" aria-label="أيام البرنامج">
          {program.plan.slice(0, today).map((d) => {
            const r = dayProgress(program.id, d, done);
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setViewDay(d.day === today ? null : d.day)}
                aria-current={d.day === dayNum ? "date" : undefined}
                className={cx(
                  "num shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold",
                  d.day === dayNum ? "bg-primary text-primary-contrast" : r.ratio === 1 ? "text-success" : "text-muted hover:text-text",
                )}
              >
                {d.day === today ? "اليوم" : `يوم ${arNum(d.day)}`}
                {r.ratio === 1 && d.day !== dayNum ? " ✓" : ""}
              </button>
            );
          })}
        </nav>
      </section>

      {viewDay && viewDay !== today && (
        <p className="mt-4 rounded-xl bg-sky px-4 py-2 text-sm">تعرض يوماً سابقاً — لا بأس بإكماله الآن، المهم أن تستمر.</p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {grouped.map(([slot, tasks]) => (
          <section key={slot} aria-labelledby={`slot-${slot}`}>
            <h3 id={`slot-${slot}`} className="mb-2 text-sm font-bold text-muted">{SLOT_LABEL[slot]}</h3>
            <ul className="flex flex-col gap-2">
              {tasks.map((t) => {
                const key = `${program.id}:${dayNum}:${t.id}`;
                const checked = Boolean(done[key]);
                const it = item(t.itemId);
                const open = openTask === key;
                return (
                  <li key={t.id} className={cx("rounded-2xl border bg-surface transition-colors", checked ? "border-transparent bg-surface-2" : "border-border")}>
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`${it.title}${checked ? " — تم" : ""}`}
                        onClick={() => {
                          toggle(dayNum, t.id);
                          if (!checked) navigator.vibrate?.(15);
                        }}
                        className={cx(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          checked ? "border-primary bg-primary text-primary-contrast" : "border-border hover:border-primary",
                        )}
                      >
                        {checked && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cx("font-semibold", checked && "text-muted line-through decoration-1")}>{it.title}</p>
                        {it.repeat && it.repeat > 1 && <p className="num text-xs text-muted">{arNum(it.repeat)} مرات</p>}
                      </div>
                      {t.to ? (
                        <Link to={t.to} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-semibold text-primary">افتح</Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenTask(open ? null : key)}
                          aria-expanded={open}
                          className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-semibold text-primary"
                        >
                          {open ? "إخفاء" : "اقرأ"}
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-border px-4 py-5">
                            <ItemView item={it} onCounted={() => !checked && toggle(dayNum, t.id)} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {dp.ratio === 1 && !allDone && (
        <div className="mt-6 rounded-2xl bg-success-bg px-5 py-4 text-success">
          <p className="font-bold">أتممت وِرد اليوم — تقبّل الله منك.</p>
          <p className="text-sm">نلقاك غداً بإذن الله. سجّل حالتك في المذكّرة إن أحببت.</p>
        </div>
      )}

      {allDone && (
        <div className="mt-6 rounded-3xl border border-border bg-dawn p-6 text-center">
          <p className="text-2xl font-bold">أتممت «{program.title}» 🌿</p>
          <p className="mt-2 text-muted">صار الوِرد عادة. ماذا بعد؟ يمكنك الإبقاء عليه أو بدء برنامج آخر.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <ShareButton content={{ kicker: "أتممت برنامجاً في سند", body: `${program.title}\n${program.tagline}`, source: "رفيق السكينة اليومي" }} className="border border-border bg-surface px-4 py-2 text-sm" />
            <Button onClick={finish}>اختر برنامجاً جديداً</Button>
          </div>
        </div>
      )}

      <QuickActions />
      <Reminders />
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <header>
      <p className="text-sm text-muted">{new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-muted">{sub}</p>
    </header>
  );
}

function QuickActions() {
  const actions = [
    { to: "/journal", title: "كيف حالك اليوم؟", sub: "سجّل حالتك في دقيقة", bg: "var(--sky)" },
    { to: "/self-ruqyah", title: "ارقِ نفسك", sub: "مرشد خطوة بخطوة", bg: "var(--sage)" },
    { to: "/awareness", title: "هل هذا صحيح؟", sub: "ميزان الوعي", bg: "var(--sand)" },
  ];
  return (
    <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="اختصارات">
      {actions.map((a) => (
        <Link key={a.to} to={a.to} className="rounded-2xl px-4 py-4 transition-transform hover:-translate-y-0.5" style={{ background: a.bg }}>
          <p className="font-bold">{a.title}</p>
          <p className="text-sm text-muted">{a.sub}</p>
        </Link>
      ))}
    </section>
  );
}

function Reminders() {
  const add = (hour: number, minute: number, name: string) =>
    downloadText(`wird-${name}.ics`, dailyReminderIcs({ hour, minute, title: "وِرد اليوم", url: `${location.origin}/today` }));
  return (
    <Card className="mt-6">
      <h2 className="font-bold">ذكّرني كل يوم</h2>
      <p className="mt-1 text-sm text-muted">نضيف تذكيراً يومياً إلى تقويم هاتفك بعنوان محايد «وِرد اليوم» — بلا إشعارات منّا ولا حساب. تحذفه من تقويمك متى شئت.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => add(6, 30, "morning")}>صباحاً ٦:٣٠</Button>
        <Button variant="secondary" onClick={() => add(17, 30, "evening")}>مساءً ٥:٣٠</Button>
        <Button variant="secondary" onClick={() => add(22, 0, "night")}>قبل النوم ١٠:٠٠</Button>
      </div>
    </Card>
  );
}
