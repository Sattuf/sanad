import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Transparency } from "@sanad/shared/api/types";
import { ProgressRing } from "../../components/companion";
import { Card } from "../../components/ui";
import { expandRef } from "../../content/library";
import { MYTHS, VERDICT_META } from "@sanad/shared/content/companion/myths";
import { programById } from "../../content/programs";
import { arNum } from "../../lib/dates";
import { currentDay, useCompanion } from "../../stores/companion";

/*
  التموضع (docs/growth/positioning.md): لا «تطبيق للمسحورين والمحسودين»،
  بل «تحصين ذاتي، ووعي فكري، وسكينة نفسية» — رسالة قوة واستغناء تخاطب الأصحاء قبل المتعبين.
*/

const tracks = [
  { key: "WaqfFree", title: "وقفي مجاني", text: "جهات وقفية وخيرية تقدّم خدماتها بلا مقابل." },
  { key: "DawahGuidance", title: "دعوي وإرشادي", text: "مشايخ ورقاة مجازون، بتوثيق إجازاتهم وتزكياتهم." },
  { key: "LicensedHealth", title: "صحي مرخّص", text: "أطباء وأخصائيون بتراخيص مزاولة موثّقة إدارياً." },
  { key: "IndependentConsultant", title: "مستشار مستقل", text: "مستشارون مستقلون بتوثيق إداري ساري." },
];

const pillars = [
  { to: "/programs", title: "برامج التزام واضحة", text: "٧ أو ١٠ أو ١٤ أو ٢١ يوماً بمهام يومية صغيرة: ماذا تقرأ ومتى وكم مرة — مع مصدر كل ذكر.", bg: "var(--bg-deep)", icon: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" },
  { to: "/self-ruqyah", title: "ارقِ نفسك بلا وسيط", text: "مرشد خطوة بخطوة: النية، وضع اليد، آيات بخط واضح وتلاوة تصحّح بها قراءتك، وتكرار تلقائي.", bg: "var(--sage)", icon: "M8 13c-2-1-3-3-3-5a7 7 0 0 1 14 0c0 2-1 4-3 5M9 17h6M10 21h4" },
  { to: "/awareness", title: "ميزان الوعي", text: "اكتب أي ممارسة سمعت عنها — ملح الهملايا، الشاكرات، الخرزة — لترى حكمها بدليله وتفسيرها العلمي وبديلها.", bg: "var(--sand)", icon: "M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7Zm10 0-3 7a3 3 0 0 0 6 0l-3-7Z" },
  { to: "/journal", title: "مذكّرة خاصة مشفّرة", text: "سجّل هدوءك ونومك ونشاطك في دقيقة. بعد أسبوعين ترى رسماً لأيامك مع التزامك — على جهازك فقط.", bg: "var(--sky)", icon: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6" },
];

function TodayMock() {
  const reduce = useReducedMotion();
  const tasks = [
    { t: "ذكر الحفظ", s: "الصباح", done: true },
    { t: "المعوّذات ×٣", s: "المساء", done: true },
    { t: "آية الكرسي", s: "قبل النوم", done: false },
  ];
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[320px] rounded-[2.2rem] border border-border bg-surface p-4 shadow-xl"
      initial={reduce ? false : { y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      aria-hidden
    >
      <div className="rounded-[1.6rem] bg-dawn p-4">
        <p className="text-xs text-muted">صباح الخير</p>
        <p className="font-bold">أساس التحصين · اليوم ٣</p>
        <div className="mt-3 flex items-center gap-3">
          <ProgressRing value={2 / 3} size={56} stroke={6}><span className="num text-xs">٢/٣</span></ProgressRing>
          <div>
            <p className="num text-2xl font-bold text-primary">٣</p>
            <p className="text-[11px] text-muted">أيام التزام</p>
          </div>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((x) => (
          <li key={x.t} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
            <span className={x.done ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-contrast" : "h-6 w-6 rounded-full border-2 border-border"}>{x.done ? "✓" : ""}</span>
            <span className={x.done ? "flex-1 text-sm text-muted line-through" : "flex-1 text-sm font-semibold"}>{x.t}</span>
            <span className="text-[11px] text-muted">{x.s}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-2xl bg-sky px-3 py-2.5 text-center">
        <p className="quran text-lg leading-[2]">{expandRef("raad-28")[0].text.split("ۗ").pop()!.trim()}</p>
      </div>
    </motion.div>
  );
}

export function HomePage() {
  const stats = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/api/v1/directory/transparency", { auth: false }) });
  const { activeProgramId, startedOn } = useCompanion();
  const active = programById(activeProgramId);
  const teaser = ["himalayan-salt", "law-of-attraction", "amulets"].map((id) => MYTHS.find((m) => m.id === id)!);

  return (
    <div className="flex flex-col gap-16">
      <section className="relative -mx-4 -mt-8 overflow-hidden bg-dawn px-4 pb-14 pt-12 md:rounded-b-[3rem]">
        <div className="pointer-events-none absolute -top-24 end-[-6rem] h-80 w-80 rounded-full bg-white/50 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-primary">مجاني بالكامل · خاص · بلا حساب</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.3] md:text-[3.4rem]">
              حصّن نفسك بنفسك.
              <br />
              <span className="text-primary">بوعيٍ وسكينة.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-9 text-muted">
              رفيقك اليومي للتحصين الذاتي: برامج التزام واضحة بالأذكار المأثورة، ومرشد يعلّمك أن ترقي نفسك وأهلك دون وسيط، وميزان يكشف لك فخاخ «الطاقة»
              والخرافات — بهدوء، ودون تخويف.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {active ? (
                <Link to="/today" className="rounded-2xl bg-primary px-6 py-3.5 font-semibold text-primary-contrast shadow-md">
                  تابع يومك — {active.title} (اليوم {arNum(currentDay(startedOn, active.days))})
                </Link>
              ) : (
                <Link to="/programs/foundation-7" className="rounded-2xl bg-primary px-6 py-3.5 font-semibold text-primary-contrast shadow-md">
                  ابدأ ٧ أيام من التحصين
                </Link>
              )}
              <Link to="/awareness/quiz" className="rounded-2xl border border-border bg-surface/80 px-6 py-3.5 font-semibold">
                اختبر وعيك في دقيقتين
              </Link>
            </div>
          </div>
          <TodayMock />
        </div>
      </section>

      <section className="flex flex-col items-center justify-between gap-4 rounded-3xl bg-[#13202c] px-6 py-6 text-[#e6eff1] md:flex-row">
        <div>
          <p className="text-lg font-bold">ضيقٌ مفاجئ؟ فزعٌ في الليل؟ أرق؟</p>
          <p className="text-sm text-[#a9bec6]">شاشة هادئة بذكر متمهّل وآيات السكينة بصوت مطمئن — تعمل حتى دون إنترنت.</p>
        </div>
        <Link to="/sakina" className="shrink-0 rounded-full bg-[rgba(124,199,191,0.2)] px-6 py-3 font-semibold text-white ring-1 ring-[rgba(124,199,191,0.5)]">
          افتح السكينة الآن
        </Link>
      </section>

      <section aria-labelledby="pillars-title">
        <h2 id="pillars-title" className="text-3xl font-bold">ليس مكتبة تتوه فيها — بل رفيق يأخذ بيدك</h2>
        <p className="mt-2 max-w-2xl text-muted">التطبيقات التقليدية تُفتح وقت الأزمة ثم تُنسى. سند مصمَّم لعادة يومية صغيرة تبقى معك.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {pillars.map((p) => (
            <Link key={p.to} to={p.to} className="group rounded-3xl p-6 transition-transform hover:-translate-y-1" style={{ background: p.bg }}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface/80 text-primary" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p.icon} /></svg>
              </span>
              <h3 className="mt-4 text-xl font-bold">{p.title}</h3>
              <p className="mt-2 leading-8 text-muted">{p.text}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-primary group-hover:underline">ابدأ ←</span>
            </Link>
          ))}
        </div>
        <Link to="/ruqyah" className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
          <span>
            <span className="block font-bold">الرقية والتحصين مكتوبةً</span>
            <span className="text-sm text-muted">أذكار الصباح والمساء والنوم وآيات الرقية كاملة بمصادرها، مع التلاوة.</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-primary">افتح ←</span>
        </Link>
      </section>

      <section aria-labelledby="myths-title" className="rounded-3xl border border-border bg-surface p-6 md:p-10">
        <p className="text-sm font-semibold text-lamp">طاقة أم شعوذة؟</p>
        <h2 id="myths-title" className="mt-1 text-3xl font-bold">احذر هذه الفخاخ المنتشرة</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {teaser.map((m) => (
            <Link key={m.id} to={`/awareness?q=${encodeURIComponent(m.keywords[0])}`} className="rounded-2xl bg-surface-2 p-4 hover:ring-1 hover:ring-primary">
              <span className="text-xs font-semibold" style={{ color: VERDICT_META[m.verdict].tone === "danger" ? "var(--danger)" : "var(--warning)" }}>
                {VERDICT_META[m.verdict].label}
              </span>
              <p className="mt-1 font-semibold leading-7">{m.title}</p>
            </Link>
          ))}
        </div>
        <Link to="/awareness" className="mt-5 inline-block font-semibold text-primary">اسأل الميزان عن أي ممارسة ←</Link>
      </section>

      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">نفرّق بين الوهم والمرض</h2>
          <p className="mt-3 leading-8 text-muted">
            ليس كل أرق عيناً، ولا كل تعب سحراً. نقص فيتامين د، واضطراب الغدة، والقلق والاكتئاب — أسباب حقيقية قابلة للفحص. سند يدعوك للتداوي المتكامل:
            الرقية والأذكار مع الأخذ بالأسباب الطبية، لا بدلاً منها. «تداووا عباد الله».
          </p>
          <Link to="/awareness?q=اعراض" className="mt-4 inline-block font-semibold text-primary">هل كل عَرَض سببه عين؟ ←</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tracks.map((t) => (
            <Link key={t.key} to={`/directory?track=${t.key}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <h3 className="font-bold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted">{t.text}</p>
              </Card>
            </Link>
          ))}
          <p className="text-xs text-muted sm:col-span-2">دليل مختصين موثّقين إدارياً — المسارات الأربعة متكافئة، وأنت تختار.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-bold">خاص تماماً</h3>
          <p className="mt-2 text-sm leading-7 text-muted">مذكّرتك مشفّرة على جهازك وتُفتح ببصمتك. لا نراها نحن ولا أحد غيرك.</p>
          <Link to="/privacy-mode" className="mt-3 inline-block text-sm font-semibold text-primary">الخصوصية والتمويه</Link>
        </Card>
        <Card>
          <h3 className="font-bold">متحفّظ على شاشتك</h3>
          <p className="mt-2 text-sm leading-7 text-muted">وضع متحفّظ يُظهر التبويب باسم «ملاحظاتي»، وخروج سريع بضغطتين.</p>
        </Card>
      </section>

      {stats.data && (
        <section aria-label="أرقام التوثيق" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="مقدّمو خدمة منشورون" value={stats.data.publishedProviders} />
          <Stat label="جهات منشورة" value={stats.data.publishedOrganizations} />
          <Stat label="أطباء مرخّصون" value={stats.data.physicianProviders} />
          <Stat label="مشايخ ورقاة" value={stats.data.religiousProviders} />
        </section>
      )}

      <section className="rounded-3xl bg-dawn px-6 py-12 text-center">
        <h2 className="text-3xl font-bold">ابدأ اليوم. عشر دقائق تكفي.</h2>
        <p className="mx-auto mt-2 max-w-lg text-muted">تعلّم كيف تحمي نفسك وعقلك وأسرتك بنفسك — دون الحاجة لأحد.</p>
        <Link to="/programs" className="mt-6 inline-block rounded-2xl bg-primary px-7 py-3.5 font-semibold text-primary-contrast shadow-md">اختر برنامجك</Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="num text-3xl font-bold text-primary">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
