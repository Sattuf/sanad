import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { GuideGrid } from "../ruqyah/RuqyahPages";
import { Scene } from "../ruqyah/Scene";
import { healthGuides } from "./content";

/** «الصحة والطمأنينة»: توعية صحية عامة، بجانب «الرقية والتحصين» — الطبيب والشيخ مساران متكافئان. */
export function HealthHubPage() {
  return (
    <div className="flex flex-col gap-10">
      <Scene theme="dawn" pan className="rounded-3xl px-6 py-14 md:px-14 md:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-lamp-glow">سند · الصحة والطمأنينة</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">الصحة والطمأنينة</h1>
          <p className="mt-4 text-lg leading-8 text-[#e6dfd0]">
            توعية صحية ونفسية مبسّطة: كيف تجمع بين الرقية والتداوي، ومتى تراجع الطبيب، وكيف تختار مختصاً موثّقاً. معلومات عامة للتوعية، ولا تغني عن الفحص والتشخيص عند المختص.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/health/when-to-see-doctor" className="rounded-xl bg-lamp-glow px-5 py-3 font-bold text-[#1d1a12]">متى تراجع الطبيب؟</Link>
            <Link to="/directory?track=LicensedHealth" className="rounded-xl border border-white/25 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20">
              مختصون صحيون موثّقون
            </Link>
          </div>
        </motion.div>
      </Scene>

      {/* الطوارئ: وضوح فوري بلا أي حركة زخرفية (references/13 §13.4) */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger-bg px-5 py-4" aria-label="الطوارئ">
        <p className="font-semibold text-danger">ألم في الصدر، ضيق نفس شديد، ضعف مفاجئ، أو أفكار بإيذاء النفس؟ اطلب الطوارئ فوراً.</p>
        <Link to="/emergency" className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white">صفحة الطوارئ</Link>
      </section>

      <section aria-labelledby="health-guides">
        <h2 id="health-guides" className="text-2xl font-bold">أدلة التوعية</h2>
        <p className="mt-1 text-muted">مكتوبة للقارئ العادي، بلا تشخيص ولا أدوية ولا جرعات.</p>
        <GuideGrid items={healthGuides} action="اقرأ ←" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/directory?track=LicensedHealth" className="group rounded-3xl border border-border bg-surface p-6 transition-colors hover:border-primary">
          <h2 className="text-xl font-bold">ابحث عن مختص صحي موثّق</h2>
          <p className="mt-1 text-muted">أطباء وأخصائيون نفسيون بتراخيص مزاولة موثّقة إدارياً — أنت من يختار.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-primary">تصفّح الدليل ←</span>
        </Link>
        <Link to="/ruqyah" className="group rounded-3xl border border-border bg-surface p-6 transition-colors hover:border-primary">
          <h2 className="text-xl font-bold">الرقية والتحصين</h2>
          <p className="mt-1 text-muted">آيات الرقية وأدعية السنة وأذكار اليوم — تجمعها مع التداوي، لا بدلاً عنه.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-primary">افتح القسم ←</span>
        </Link>
      </section>
    </div>
  );
}
