import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMe } from "../../api/hooks";
import { cx } from "../../lib/cx";
import { NotFoundPage } from "../../app/NotFoundPage";
import { GROUP_ORDER, HERO_VERSES as heroVerses, awarenessGuides, collections, findCollection, findGuide, groups, guidePath, methodGuides, suggestedWird, type Collection, type Guide, type Item, type SceneTheme } from "@sanad/shared/content/ruqyah";
import { quran } from "@sanad/shared/content/quran";
import { useDailyProgress, useCollectionEntries, useMyWird, type MyWird } from "./progress";
import { DueWirdNudge, ReminderCard } from "./ReminderWidgets";
import { renderShareCard, shareOrDownload } from "./shareImage";
import { reciters, useActiveAyah, useRecitation, type QueueEntry } from "./recitation";
import { Ornament, Scene } from "./Scene";

const arNum = (n: number) => n.toLocaleString("ar-EG");
const ease = [0.22, 1, 0.36, 1] as const;

// ── الصفحة الرئيسية ─────────────────────────────────────────────────────────

export function RuqyahHubPage() {
  const { data: me } = useMe();
  const myWird = useMyWird(Boolean(me));
  const wird = useMemo(() => suggestedWird(new Date().getHours()), []);
  const order = GROUP_ORDER;

  return (
    <div className="flex flex-col gap-14">
      <Scene theme="lantern" pan className="rounded-3xl px-6 py-14 md:px-14 md:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-lamp-glow">سند · الرقية والتحصين</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">الرقية الشرعية والتحصين</h1>
          <p className="mt-4 text-lg leading-8 text-[var(--scene-soft)]">
            آيات الرقية، وأدعية السنة الثابتة بتخريجها، وأذكار اليوم والليلة، ومنهج عملي للوقاية والرقية على النفس — مكتوبة بخط المصحف ومرتّبة لتقرأها بقلب حاضر.
          </p>
        </motion.div>
        <VerseCarousel />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={`/ruqyah/${wird.id}`} className="rounded-xl bg-lamp-glow px-5 py-3 font-bold text-[var(--scene-on-gold)] shadow-[0_0_30px_color-mix(in_srgb,var(--scene-gold)_35%,transparent)] transition-transform hover:-translate-y-0.5">
            ابدأ {wird.label}
          </Link>
          <Link to="/ruqyah/guide/treatment" className="rounded-xl border border-white/25 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition-colors hover:bg-white/20">
            كيف أرقي نفسي؟
          </Link>
        </div>
      </Scene>

      <DueWirdNudge wird={myWird.data} />
      {myWird.data && <StreakCard wird={myWird.data} />}

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
        <GuideGrid items={methodGuides} action="اقرأ المنهج ←" />
      </section>

      <section aria-labelledby="awareness-title">
        <Ornament className="mb-6" />
        <h2 id="awareness-title" className="text-2xl font-bold">توعية وتحذير</h2>
        <p className="mt-1 text-muted">السحر وأنواعه والموقف الشرعي منه، وحكم اليوغا و«الطاقة» والممارسات المعاصرة — تعريف وتحذير بالدليل.</p>
        <GuideGrid items={awarenessGuides} action="اقرأ ←" />
      </section>

      <ReminderCard />

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

/** المداومة: أيام متتالية أُتمّ فيها ورد واحد على الأقل، وآخر 30 يوماً كنقاط. */
function StreakCard({ wird }: { wird: MyWird }) {
  const reduce = useReducedMotion();
  const done = new Set(wird.completedDays);
  const days = Array.from({ length: 30 }, (_, k) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - k));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  return (
    <section className="flex flex-wrap items-center gap-6 rounded-3xl border border-border bg-surface p-6" aria-label="المداومة">
      <div>
        <p className="text-sm text-muted">مداومتك على الورد</p>
        {wird.streak > 0 ? (
          <p className="mt-1 text-3xl font-bold">
            <span className="num text-lamp">{arNum(wird.streak)}</span> {wird.streak === 1 ? "يوم" : wird.streak === 2 ? "يومان" : wird.streak <= 10 ? "أيام" : "يوماً"}
          </p>
        ) : (
          <p className="mt-1 text-xl font-bold">ابدأ مداومتك اليوم بإتمام ورد واحد</p>
        )}
      </div>
      <ol className="flex flex-1 flex-wrap gap-1.5" aria-label="آخر ٣٠ يوماً">
        {days.map((d, k) => (
          <motion.li
            key={d}
            title={d}
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: k * 0.015 }}
            className={cx("h-3.5 w-3.5 rounded-full", done.has(d) ? "bg-lamp-glow shadow-[0_0_8px_var(--lamp-glow)]" : "bg-surface-2 ring-1 ring-border")}
          >
            <span className="sr-only">{d}{done.has(d) ? " — مكتمل" : ""}</span>
          </motion.li>
        ))}
      </ol>
      <p className="w-full text-sm text-muted">«أحبّ الأعمال إلى الله أدومها وإن قلّ»</p>
    </section>
  );
}

export function GuideGrid({ items, action }: { items: Guide[]; action: string }) {
  return (
    <ul className="mt-5 grid gap-4 md:grid-cols-3">
      {items.map((g, i) => (
        <motion.li key={g.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08, ease }}>
          <Link to={guidePath(g)} className="group block h-full">
            <Scene theme={g.theme} className="flex h-full min-h-44 flex-col justify-end rounded-2xl p-5 ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-lamp-glow/60">
              <h3 className="text-lg font-bold">{g.title}</h3>
              <p className="mt-1 text-sm text-[var(--scene-muted)]">{g.subtitle}</p>
              <span className="mt-3 text-sm font-semibold text-lamp-glow">{action}</span>
            </Scene>
          </Link>
        </motion.li>
      ))}
    </ul>
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
            <p className="font-quran text-2xl leading-[2.3] text-[var(--scene-verse)] md:text-3xl">﴿{p.ayat[v.index]}﴾</p>
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
      <Scene theme={c.theme} className="flex h-full min-h-52 flex-col justify-end rounded-2xl p-5 ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-18px_color-mix(in_srgb,var(--scene-gold)_45%,transparent)] group-hover:ring-lamp-glow/60">
        <span className="absolute end-4 top-4 rounded-full bg-black/30 px-2.5 py-0.5 text-xs text-[var(--scene-soft)] backdrop-blur">{arNum(c.items.length)} {c.items.length > 10 ? "مقطعاً" : "مقاطع"}</span>
        <h3 className="text-xl font-bold">{c.title}</h3>
        <p className="mt-1 text-sm text-[var(--scene-muted)]">{c.subtitle}</p>
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

export function RuqyahCollectionPage() {
  const { collectionId } = useParams();
  const c = findCollection(collectionId);
  if (!c) return <NotFoundPage />;
  return <CollectionReader key={c.id} collection={c} />;
}

function CollectionReader({ collection: c }: { collection: Collection }) {
  const [scale, setScale] = useState(readScale);
  const [showSources, setShowSources] = useState(true);
  const entries = useCollectionEntries(c.id, c.items);
  const { counts, bump, reset, completed: done, synced } = useDailyProgress(c.id, entries);
  const pct = Math.round((done / entries.length) * 100);
  const idx = collections.indexOf(c);
  const next = collections[(idx + 1) % collections.length];
  const quranQueue: QueueEntry[] = entries.flatMap(({ item }, i) => (item.kind === "quran" ? [{ itemIndex: i, ref: item.ref }] : []));

  // لا تستمر التلاوة بعد مغادرة المجموعة (فهارس الطابور تخصّها وحدها)
  useEffect(() => () => useRecitation.getState().stop(), []);

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
        <nav aria-label="مسار التنقل" className="text-sm text-[var(--scene-muted)]">
          <Link to="/ruqyah" className="hover:text-lamp-glow">الرقية والتحصين</Link> <span aria-hidden>/</span> {groups[c.group].title}
        </nav>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="mt-3 text-3xl font-bold md:text-4xl">
          {c.title}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease }} className="mt-3 max-w-2xl leading-8 text-[var(--scene-soft)]">
          {c.intro}
        </motion.p>
        <div className="mt-6 max-w-md">
          <div className="flex justify-between text-xs text-[var(--scene-muted)]">
            <span>ورد اليوم{synced ? " · محفوظ في حسابك" : ""}</span>
            <span className="num">{arNum(done)} / {arNum(entries.length)}</span>
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
        {quranQueue.length > 0 && <RecitationControls queue={quranQueue} />}
        {done > 0 && <button type="button" onClick={reset} className="ms-auto rounded-xl px-3 py-1.5 text-sm text-muted hover:text-text">إعادة الورد</button>}
      </div>

      <ol className="mt-6 flex flex-col gap-5">
        {entries.map(({ key, item }, i) => (
          <ItemCard key={key} index={i} item={item} theme={c.theme} n={i + 1} scale={scale} showSources={showSources} count={counts[key] ?? 0} onCount={() => bump(key, item.repeat ?? 1)} />
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
            <p className="text-xs text-[var(--scene-muted)]">التالي</p>
            <p className="text-lg font-bold">{next.title}</p>
          </div>
          <span className="text-2xl text-lamp-glow transition-transform duration-300 group-hover:-translate-x-1.5">←</span>
        </Scene>
      </Link>
    </motion.div>
  );
}

function ItemCard({ index, item, theme, n, scale, showSources, count, onCount }: {
  index: number; item: Item; theme: SceneTheme; n: number; scale: number; showSources: boolean; count: number; onCount: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const activeAyah = useActiveAyah(index);
  const playItem = useRecitation((s) => s.play);
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
        <div className="flex shrink-0 items-center gap-1">
        {item.kind === "quran" && (
          <button
            type="button"
            onClick={() => (activeAyah === null ? playItem([{ itemIndex: index, ref: item.ref }]) : useRecitation.getState().toggle())}
            className={cx("rounded-lg px-2 py-1 text-xs font-semibold hover:bg-surface-2", activeAyah !== null ? "text-lamp" : "text-primary")}
            aria-label={activeAyah !== null ? "إيقاف التلاوة مؤقتاً" : `استمع إلى ${item.title}`}
          >
            {activeAyah !== null ? "❚❚ إيقاف" : "▶ استمع"}
          </button>
        )}
        <button
          type="button"
          disabled={sharing}
          onClick={async () => {
            setSharing(true);
            try {
              const blob = await renderShareCard(passage
                ? { theme, quran: true, title: item.title, text: passage.ayat.map((a, k) => `${a}\u00a0﴿${arNum(passage.from + k)}﴾`).join(" "), source: `[${passage.surahName}: ${arNum(passage.from)}${passage.to > passage.from ? `–${arNum(passage.to)}` : ""}]` }
                : { theme, quran: false, title: item.title, text: item.kind === "dua" ? item.text : "", source: item.kind === "dua" ? item.source : "" });
              await shareOrDownload(blob, `sanad-${n}`);
            } finally {
              setSharing(false);
            }
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
          aria-label="مشاركة كصورة"
        >
          {sharing ? "…" : "صورة"}
        </button>
        <button type="button" onClick={copy} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text" aria-label="نسخ النص">
          {copied ? "نُسخ ✓" : "نسخ"}
        </button>
        </div>
      </header>

      <div className="mt-5" style={{ fontSize: `${scale}rem` }}>
        {passage ? (
          <p className="font-quran text-[1.4em] leading-[2.3] md:text-[1.65em] md:leading-[2.4] text-text" dir="rtl">
            {passage.ayat.map((a, k) => (
              <AyahSpan key={k} active={activeAyah === k}>
                {a} <span className="text-lamp">﴿{arNum(passage.from + k)}﴾</span>{" "}
              </AyahSpan>
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

/** الآية الجارية تلاوتها: خلفية ذهبية خافتة، وتمرير هادئ إليها إن خرجت من الشاشة. */
function AyahSpan({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 120 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);
  return (
    <span
      ref={ref}
      className={cx("rounded-lg transition-colors duration-500 [box-decoration-break:clone]", active && "bg-[color-mix(in_srgb,var(--lamp-glow)_22%,transparent)]")}
    >
      {children}
    </span>
  );
}

/** اختيار القارئ وتشغيل آيات المجموعة كلها متتابعة. */
function RecitationControls({ queue }: { queue: QueueEntry[] }) {
  const { reciter, status, setReciter, play, toggle, stop } = useRecitation();
  const active = status !== "idle";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
      <button
        type="button"
        onClick={() => (active ? toggle() : play(queue))}
        className="rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-primary-contrast"
      >
        {status === "playing" || status === "loading" ? "❚❚ إيقاف مؤقت" : status === "paused" ? "▶ متابعة" : status === "error" ? "↻ أعد المحاولة" : "▶ استمع للآيات"}
      </button>
      {active && <button type="button" onClick={stop} className="rounded-lg px-2 py-1 text-sm text-muted hover:text-text" aria-label="إنهاء التلاوة">■</button>}
      <label htmlFor="reciter" className="sr-only">القارئ</label>
      <select id="reciter" value={reciter} onChange={(e) => setReciter(e.target.value)} className="max-w-40 rounded-lg bg-transparent px-2 py-1 text-sm text-muted">
        {reciters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {status === "loading" && <span className="px-1 text-xs text-muted" aria-live="polite">يُحمَّل…</span>}
      {status === "error" && <span className="px-1 text-xs text-warning" aria-live="polite">تعذّر التشغيل</span>}
    </div>
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

/** مسار التنقل والأدلة ذات الصلة لكل قسم. */
const guideSections: Record<NonNullable<Guide["kind"]>, { root: { to: string; label: string }; crumb?: string; tag: string; list: Guide[] }> = {
  method: { root: { to: "/ruqyah", label: "الرقية والتحصين" }, crumb: "المنهج", tag: "منهج", list: methodGuides },
  awareness: { root: { to: "/ruqyah", label: "الرقية والتحصين" }, crumb: "توعية وتحذير", tag: "توعية", list: awarenessGuides },
};

export function RuqyahGuidePage() {
  const { guideId } = useParams();
  const g = findGuide(guideId);
  if (!g) return <NotFoundPage />;
  const kind = g.kind ?? "method";
  const meta = guideSections[kind];
  const related = meta.list.filter((x) => x.id !== g.id);

  return (
    <motion.div key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <Scene theme={g.theme} pan className="rounded-3xl px-6 py-10 md:px-12 md:py-14">
        <nav aria-label="مسار التنقل" className="text-sm text-[var(--scene-muted)]">
          <Link to={meta.root.to} className="hover:text-lamp-glow">{meta.root.label}</Link>
          {meta.crumb && <> <span aria-hidden>/</span> {meta.crumb}</>}
        </nav>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">{g.title}</h1>
        <p className="mt-3 max-w-2xl leading-8 text-[var(--scene-soft)]">{g.intro}</p>
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
            {s.cta && (
              <Link
                to={s.cta.to}
                className="mt-5 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
              >
                {s.cta.label}
              </Link>
            )}
          </motion.section>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {related.map((x) => (
          <Link key={x.id} to={guidePath(x)} className="group">
            <Scene theme={x.theme} className="rounded-2xl p-5 ring-1 ring-white/10 transition-all group-hover:ring-lamp-glow/60">
              <p className="text-xs text-[var(--scene-muted)]">{meta.tag}</p>
              <p className="font-bold">{x.title}</p>
            </Scene>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
