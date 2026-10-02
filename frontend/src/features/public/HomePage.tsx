import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Transparency } from "@sanad/shared/api/types";
import { AnimatedLamp, ParticleField } from "../../components/motion/Lamp";
import { Card } from "../../components/ui";

const tracks = [
  { key: "WaqfFree", title: "وقفي مجاني", text: "جهات وقفية وخيرية تقدّم خدماتها بلا مقابل." },
  { key: "DawahGuidance", title: "دعوي وإرشادي", text: "مشايخ ورقاة مجازون، بتوثيق إجازاتهم وتزكياتهم." },
  { key: "LicensedHealth", title: "صحي مرخّص", text: "أطباء وأخصائيون بتراخيص مزاولة موثّقة إدارياً." },
  { key: "IndependentConsultant", title: "مستشار مستقل", text: "مستشارون مستقلون بتوثيق إداري ساري." },
];

export function HomePage() {
  const stats = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/api/v1/directory/transparency", { auth: false }) });

  return (
    <div className="flex flex-col gap-14">
      <section className="relative grid items-center gap-8 overflow-hidden rounded-3xl border border-border px-6 py-12 md:grid-cols-2 md:px-12" style={{ background: "var(--bg-deep)" }}>
        <ParticleField count={18} />
        <div className="relative">
          <p className="text-sm font-semibold text-lamp">مجاني بالكامل — بلا اشتراكات ولا ترتيب مدفوع</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">سند: وصول آمن لجهات ومستشارين موثّقين</h1>
          <p className="mt-4 max-w-lg text-lg text-muted">
            ابحث في دليل موثّق إدارياً، احجز موعداً، وتواصل إدارياً — واستمع لتلاوات وأدعية من مصادر معروفة. سند لا تشخّص ولا تعالج، بل توصلك بمن
            تختاره أنت.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/directory" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-contrast">
              تصفّح الدليل
            </Link>
            <Link to="/ruqyah" className="rounded-xl border border-border bg-surface px-5 py-3 font-semibold">
              الرقية والتحصين
            </Link>
          </div>
        </div>
        <div className="relative hidden justify-center md:flex">
          <AnimatedLamp size={150} />
        </div>
      </section>

      <section aria-labelledby="tracks-title">
        <h2 id="tracks-title" className="text-2xl font-bold">أربعة مسارات متكافئة — أنت تختار</h2>
        <p className="mt-1 text-muted">لا يرتّب سند أي مسار فوق آخر، ولا يقترح عليك تصنيفاً لحالتك.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tracks.map((t) => (
            <Link key={t.key} to={`/directory?track=${t.key}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <h3 className="font-bold">{t.title}</h3>
                <p className="mt-2 text-sm text-muted">{t.text}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="font-bold">توثيق إداري صارم</h3>
          <p className="mt-2 text-sm text-muted">لا يظهر أي مقدّم خدمة بلا توثيق ساري. الطبيب والشيخ مساران متكافئان، ولكلٍّ مستنداته المطابقة.</p>
          <Link to="/about-verification" className="mt-3 inline-block text-sm font-semibold text-primary">كيف نوثّق؟</Link>
        </Card>
        <Card>
          <h3 className="font-bold">خصوصيتك محمية</h3>
          <p className="mt-2 text-sm text-muted">ملاحظاتك للمختص مشفّرة، ولا يراها إلا المختص المُسنَد. لا تصنيف لحالتك في أي مكان.</p>
        </Card>
        <Card>
          <h3 className="font-bold">في خطر الآن؟</h3>
          <p className="mt-2 text-sm text-muted">سند ليست خدمة طوارئ. إن كنت أو أحد حولك في خطر مباشر، اتصل بالطوارئ فوراً.</p>
          <Link to="/emergency" className="mt-3 inline-block text-sm font-bold text-danger">صفحة الطوارئ</Link>
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
