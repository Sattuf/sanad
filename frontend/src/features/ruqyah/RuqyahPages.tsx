import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMe } from "../../api/hooks";
import { cx } from "../../lib/cx";
import { NotFoundPage } from "../../app/NotFoundPage";
import { collections, findCollection, findGuide, groups, guides, type Collection, type CollectionGroup, type Item } from "./content";
import { quran, type QuranKey } from "./quran";
import { Ornament, Scene } from "./Scene";

const arNum = (n: number) => n.toLocaleString("ar-EG");
const ease = [0.22, 1, 0.36, 1] as const;

// ── الصفحة الرئيسية ─────────────────────────────────────────────────────────

/** آيات قصيرة تتناوب في واجهة القسم — نصها من quran.ts نفسه. */
const heroVerses: Array<{ ref: QuranKey; index: number }> = [
  { ref: "isra-82", index: 0 },
  { ref: "yunus-57", index: 0 },
  { ref: "shuara-80", index: 0 },
  { ref: "falaq", index: 0 },
  { ref: "kahf-39", index: 0 },
];

function suggestedWird(hour: number): { id: string; label: string } {
  if (hour >= 4 && hour < 12) return { id: "morning-evening", label: "أذكار الصباح" };
  if (hour >= 15 && hour < 21) return { id: "morning-evening", label: "أذكار المساء" };
  if (hour >= 21 || hour < 4) return { id: "sleep", label: "أذكار النوم" };
  return { id: "ruqyah-quran", label: "آيات الرقية" };
}

export function RuqyahHubPage() {
  const { data: me } = useMe();
  const wird = useMemo(() => suggestedWird(new Date().getHours()), []);
  const order: CollectionGroup[] = ["treatment", "prevention", "relief"];

  return (
    <div className="flex flex-col gap-14">
      <Scene theme="lantern" pan className="rounded-3xl px-6 py-14 md:px-14 md:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-lamp-glow">سند · الرقية والتحصين</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">الرقية الشرعية والتحصين</h1>
          <p className="mt-4 text-lg leading-8 text-[#e6dfd0]">
            آيات الرقية، وأدعية السنة الثابتة بتخريجها، وأذكار اليوم والليلة، ومنهج عملي للوقاية والرقية على النفس — مكتوبة بخط المصحف ومرتّبة لتقرأها بقلب حاضر.
          </p>
        </motion.div>
        <VerseCarousel />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={`/ruqyah/${wird.id}`} className="rounded-xl bg-lamp-glow px-5 py-3 font-bold text-[#1d1a12] shadow-[0_0_30px_rgba(242,198,117,.35)] transition-transform hover:-translate-y-0.5">
            ابدأ {wird.label}
          </Link>
          <Link to="/ruqyah/guide/treatment" className="rounded-xl border border-white/25 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition-colors hover:bg-white/20">
            كيف أرقي نفسي؟
          </Link>
        </div>
      </Scene>

      {order.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="text-2xl font-bold">{groups[g].title}</h2>
          <p className="mt-1 text-muted">{groups[g].text}</p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.filter((c) => c.group === g).map((c, i) => (
              <motion.li key={c.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.07, ease }}>
                <CollectionCard collection={c} />
              </motion.li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="guides-title">
        <Ornament className="mb-6" />
        <h2 id="guides-title" className="text-2xl font-bold">منهج الوقاية والعلاج الشرعي</h2>
        <p className="mt-1 text-muted">خطوات عملية مدعومة بالدليل: كيف تتحصّن، وكيف ترقي نفسك، وما الذي تحذره.</p>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {guides.map((g, i) => (
            <motion.li key={g.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08, ease }}>
              <Link to={`/ruqyah/guide/${g.id}`} className="group block h-full">
                <Scene theme={g.theme} className="flex h-full min-h-44 flex-col justify-end rounded-2xl p-5 ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-lamp-glow/60">
                  <h3 className="text-lg font-bold">{g.title}</h3>
                  <p className="mt-1 text-sm text-[#d9d2c3]">{g.subtitle}</p>
                  <span className="mt-3 text-sm font-semibold text-lamp-glow">اقرأ المنهج ←</span>
                </Scene>
              </Link>
            </motion.li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6 md:flex md:items-center md:justify-between md:gap-6">
        <div>
          <h2 className="text-xl font-bold">استمع للرقية بأصوات القرّاء</h2>
          <p className="mt-1 text-muted">سور كاملة وآيات الرقية وأذكار حصن المسلم مسموعة من مصادر موثوقة، في المكتبة الصوتية.</p>
        </div>
        <Link to={me ? "/library" : "/login"} className="mt-4 inline-block shrink-0 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast md:mt-0">
          المكتبة الصوتية
        </Link>
      </section>
    </div>
  );
}

function VerseCarousel() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % heroVerses.length), 7000);
    return () => window.clearInterval(id);
  }, [reduce, paused]);
  const v = heroVerses[i];
  const p = quran[v.ref];

  return (
    <figure className="mt-8 max-w-2xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="polite">
      <div className="relative min-h-28">
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={i}
            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
            transition={{ duration: 0.8, ease }}
          >
            <p className="font-quran text-2xl leading-[2.3] text-[#fbf6ea] md:text-3xl">﴿{p.ayat[v.index]}﴾</p>
            <figcaption className="mt-1 text-sm text-lamp-glow">[{p.surahName}: {arNum(p.from + v.index)}]</figcaption>
          </motion.blockquote>
        </AnimatePresence>
      </div>
      <div className="mt-3 flex gap-1.5" role="tablist" aria-label="الآيات">
        {heroVerses.map((_, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === i}
            aria-label={`الآية ${arNum(k + 1)}`}
            onClick={() => setI(k)}
            className={cx("h-1.5 rounded-full transition-all duration-500", k === i ? "w-8 bg-lamp-glow" : "w-3 bg-white/30 hover:bg-white/50")}
          />
        ))}
      </div>
    </figure>
  );
}

function CollectionCard({ collection: c }: { collection: Collection }) {
  return (
    <Link to={`/ruqyah/${c.id}`} className="group block h-full">
      <Scene theme={c.theme} className="flex h-full min-h-52 flex-col justify-end rounded-2xl p-5 ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-18px_rgba(242,198,117,.45)] group-hover:ring-lamp-glow/60">
        <span className="absolute end-4 top-4 rounded-full bg-black/30 px-2.5 py-0.5 text-xs text-[#e6dfd0] backdrop-blur">{arNum(c.items.length)} {c.items.length > 10 ? "مقطعاً" : "مقاطع"}</span>
        <h3 className="text-xl font-bold">{c.title}</h3>
        <p className="mt-1 text-sm text-[#d9d2c3]">{c.subtitle}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-lamp-glow">
          اقرأ الآن
          <span className="transition-transform duration-300 group-hover:-translate-x-1">←</span>
        </span>
      </Scene>
    </Link>
  );
}

// ── قارئ المجموعة ───────────────────────────────────────────────────────────

const FONT_KEY = "sanad.ruqyah.fontScale";
const fontScales = [0.9, 1, 1.15, 1.3, 1.5];

function readScale(): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return fontScales.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** تقدّم اليوم لكل مجموعة — يُحفظ في جهاز الزائر فقط ويُصفَّر تلقائياً مع يوم جديد. */
function useDailyProgress(collectionId: string) {
  const key = `sanad.ruqyah.progress.${collectionId}.${new Date().toISOString().slice(0, 10)}`;
  const [counts, setCounts] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<number, number>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(counts));
    } catch {
      /* التخزين اختياري */
    }
  }, [key, counts]);
  const bump = useCallback((i: number, max: number) => setCounts((c) => ({ ...c, [i]: Math.min(max, (c[i] ?? 0) + 1) })), []);
  const reset = useCallback(() => setCounts({}), []);
  return { counts, bump, reset };
}

export function RuqyahCollectionPage() {
  const { collectionId } = useParams();
  const c = findCollection(collectionId);
  if (!c) return <NotFoundPage />;
  return <CollectionReader key={c.id} collection={c} />;
}

function CollectionReader({ collection: c }: { collection: Collection }) {
  const [scale, setScale] = useState(readScale);
  const [showSources, setShowSources] = useState(true);
  const { counts, bump, reset } = useDailyProgress(c.id);
  const done = c.items.filter((it, i) => (counts[i] ?? 0) >= (it.repeat ?? 1)).length;
  const pct = Math.round((done / c.items.length) * 100);
  const idx = collections.indexOf(c);
  const next = collections[(idx + 1) % collections.length];

  const changeScale = (dir: 1 | -1) => {
    const k = Math.min(fontScales.length - 1, Math.max(0, fontScales.indexOf(scale) + dir));
    setScale(fontScales[k]);
    try {
      localStorage.setItem(FONT_KEY, String(fontScales[k]));
    } catch {
      /* تجاهل */
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <Scene theme={c.theme} pan className="rounded-3xl px-6 py-10 md:px-12 md:py-14">
        <nav aria-label="مسار التنقل" className="text-sm text-[#d9d2c3]">
          <Link to="/ruqyah" className="hover:text-lamp-glow">الرقية والتحصين</Link> <span aria-hidden>/</span> {groups[c.group].title}
        </nav>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="mt-3 text-3xl font-bold md:text-4xl">
          {c.title}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease }} className="mt-3 max-w-2xl leading-8 text-[#e6dfd0]">
          {c.intro}
        </motion.p>
        <div className="mt-6 max-w-md">
          <div className="flex justify-between text-xs text-[#d9d2c3]">
            <span>ورد اليوم</span>
            <span className="num">{arNum(done)} / {arNum(c.items.length)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="التقدّم">
            <motion.div className="h-full rounded-full bg-lamp-glow" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease }} />
          </div>
        </div>
      </Scene>

      <div className="sticky top-[65px] z-20 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1" role="group" aria-label="حجم الخط">
          <button type="button" onClick={() => changeScale(-1)} className="rounded-lg px-3 py-1 text-sm font-bold hover:bg-surface-2" aria-label="تصغير الخط">أ−</button>
          <button type="button" onClick={() => changeScale(1)} className="rounded-lg px-3 py-1 text-lg font-bold hover:bg-surface-2" aria-label="تكبير الخط">أ+</button>
        </div>
        <button type="button" aria-pressed={showSources} onClick={() => setShowSources((s) => !s)} className={cx("rounded-xl border px-3 py-1.5 text-sm font-semibold", showSources ? "border-primary text-primary" : "border-border text-muted")}>
          التخريج والفوائد
        </button>
        {done > 0 && <button type="button" onClick={reset} className="ms-auto rounded-xl px-3 py-1.5 text-sm text-muted hover:text-text">إعادة الورد</button>}
      </div>

      <ol className="mt-6 flex flex-col gap-5">
        {c.items.map((it, i) => (
          <ItemCard key={i} item={it} n={i + 1} scale={scale} showSources={showSources} count={counts[i] ?? 0} onCount={() => bump(i, it.repeat ?? 1)} />
        ))}
      </ol>

      <AnimatePresence>
        {pct === 100 && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="mt-8 rounded-2xl border border-lamp/40 bg-surface p-6 text-center">
            <Ornament />
            <p className="mt-3 text-lg font-bold">أتممت {c.title} — تقبّل الله منك</p>
            <p className="mt-1 text-muted">«أحبّ الأعمال إلى الله أدومها وإن قلّ» — رواه البخاري (6464) ومسلم (783)</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Link to={`/ruqyah/${next.id}`} className="group mt-8 block">
        <Scene theme={next.theme} className="flex items-center justify-between rounded-2xl p-5 ring-1 ring-white/10 transition-all group-hover:ring-lamp-glow/60">
          <div>
            <p className="text-xs text-[#d9d2c3]">التالي</p>
            <p className="text-lg font-bold">{next.title}</p>
          </div>
          <span className="text-2xl text-lamp-glow transition-transform duration-300 group-hover:-translate-x-1.5">←</span>
        </Scene>
      </Link>
    </motion.div>
  );
}

function ItemCard({ item, n, scale, showSources, count, onCount }: {
  item: Item; n: number; scale: number; showSources: boolean; count: number; onCount: () => void;
}) {
  const repeat = item.repeat ?? 1;
  const complete = count >= repeat;
  const [copied, setCopied] = useState(false);
  const passage = item.kind === "quran" ? quran[item.ref] : null;
  const plain = passage ? passage.ayat.join(" ") : item.kind === "dua" ? item.text : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(passage ? `${plain}\n[${passage.surahName}: ${passage.from}${passage.to > passage.from ? `–${passage.to}` : ""}]` : plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease }}
      className={cx(
        "relative overflow-hidden rounded-2xl border bg-surface p-5 transition-[border-color,box-shadow] duration-500 md:p-7",
        complete ? "border-lamp/50 shadow-[0_0_0_1px_color-mix(in_srgb,var(--lamp-glow)_30%,transparent),0_12px_40px_-20px_var(--lamp-glow)]" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-lamp/40 text-sm font-bold text-lamp">{arNum(n)}</span>
          <div>
            <h2 className="font-bold">{item.title}</h2>
            {passage && <p className="text-xs text-muted">سورة {passage.surahName} · {passage.from === passage.to ? `الآية ${arNum(passage.from)}` : `الآيات ${arNum(passage.from)}–${arNum(passage.to)}`}</p>}
          </div>
        </div>
        <button type="button" onClick={copy} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text" aria-label="نسخ النص">
          {copied ? "نُسخ ✓" : "نسخ"}
        </button>
      </header>

      <div className="mt-5" style={{ fontSize: `${scale}rem` }}>
        {passage ? (
          <p className="font-quran text-[1.4em] leading-[2.3] md:text-[1.65em] md:leading-[2.4] text-text" dir="rtl">
            {passage.ayat.map((a, k) => (
              <span key={k}>
                {a} <span className="text-lamp">﴿{arNum(passage.from + k)}﴾</span>{" "}
              </span>
            ))}
          </p>
        ) : item.kind === "dua" ? (
          <p className="font-naskh text-[1.3em] leading-[2.1] md:text-[1.45em] md:leading-[2.2] text-text">{item.text}</p>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {showSources && (item.kind === "dua" || item.note) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              {item.kind === "dua" && <p className="font-semibold text-primary">{item.source}</p>}
              {item.note && <p className="leading-7 text-muted">{item.note}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-end">
        <Counter count={count} repeat={repeat} onCount={onCount} />
      </div>
    </motion.li>
  );
}

/** عدّاد الذكر: حلقة تمتلئ مع كل نقرة، واهتزاز خفيف على الجوال، وتوهّج عند الإتمام. */
function Counter({ count, repeat, onCount }: { count: number; repeat: number; onCount: () => void }) {
  const reduce = useReducedMotion();
  const complete = count >= repeat;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const click = () => {
    if (complete) return;
    onCount();
    try {
      navigator.vibrate?.(count + 1 >= repeat ? [20, 40, 20] : 12);
    } catch {
      /* غير مدعوم */
    }
  };

  return (
    <motion.button
      type="button"
      onClick={click}
      whileTap={reduce || complete ? undefined : { scale: 0.9 }}
      aria-label={complete ? "تمّ" : repeat > 1 ? `عدّ: ${count} من ${repeat}` : "تمّت القراءة"}
      className={cx("flex items-center gap-3 rounded-full py-1 pe-4 ps-1 text-sm font-semibold transition-colors", complete ? "text-lamp" : "text-muted hover:text-text")}
    >
      <span className="relative grid h-14 w-14 place-items-center">
        <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
          <motion.circle
            cx="26" cy="26" r={r} fill="none" stroke="var(--lamp-glow)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circ}
            initial={false}
            animate={{ strokeDashoffset: circ * (1 - Math.min(count, repeat) / repeat) }}
            transition={{ duration: 0.4, ease }}
          />
        </svg>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={complete ? "done" : count}
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.8 }}
            transition={{ duration: 0.25 }}
            className={cx("num text-base font-bold", complete && "text-lamp")}
          >
            {complete ? "✓" : repeat > 1 ? arNum(repeat - count) : "•"}
          </motion.span>
        </AnimatePresence>
      </span>
      {complete ? "تمّ" : repeat > 1 ? `${arNum(repeat)} ${repeat > 10 ? "مرة" : "مرات"} — اضغط مع كل مرة` : "قرأتُها"}
    </motion.button>
  );
}

// ── صفحة المنهج ─────────────────────────────────────────────────────────────

export function RuqyahGuidePage() {
  const { guideId } = useParams();
  const g = findGuide(guideId);
  if (!g) return <NotFoundPage />;

  return (
    <motion.div key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <Scene theme={g.theme} pan className="rounded-3xl px-6 py-10 md:px-12 md:py-14">
        <nav aria-label="مسار التنقل" className="text-sm text-[#d9d2c3]">
          <Link to="/ruqyah" className="hover:text-lamp-glow">الرقية والتحصين</Link> <span aria-hidden>/</span> المنهج
        </nav>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">{g.title}</h1>
        <p className="mt-3 max-w-2xl leading-8 text-[#e6dfd0]">{g.intro}</p>
      </Scene>

      <div className="mt-8 flex flex-col gap-6">
        {g.sections.map((s, si) => (
          <motion.section
            key={s.heading}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, ease }}
            className="rounded-2xl border border-border bg-surface p-5 md:p-7"
          >
            <h2 className="flex items-center gap-3 text-xl font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-contrast">{arNum(si + 1)}</span>
              {s.heading}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {s.points.map((p) => (
                <li key={p.text} className="flex gap-3">
                  <span className="mt-2.5 h-2 w-2 shrink-0 rotate-45 bg-lamp" aria-hidden />
                  <div>
                    <p className="leading-8">{p.text}</p>
                    {p.evidence && <p className="mt-1 border-s-2 border-lamp/50 ps-3 font-naskh text-[1.05rem] leading-8 text-muted">{p.evidence}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {g.id === "conditions" && si === g.sections.length - 1 && (
              <Link to="/directory?track=DawahGuidance" className="mt-5 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">
                تصفّح المشايخ والرقاة الموثّقين
              </Link>
            )}
          </motion.section>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {guides.filter((x) => x.id !== g.id).map((x) => (
          <Link key={x.id} to={`/ruqyah/guide/${x.id}`} className="group">
            <Scene theme={x.theme} className="rounded-2xl p-5 ring-1 ring-white/10 transition-all group-hover:ring-lamp-glow/60">
              <p className="text-xs text-[#d9d2c3]">منهج</p>
              <p className="font-bold">{x.title}</p>
            </Scene>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
