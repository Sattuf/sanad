import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Transparency } from "@sanad/shared/api/types";
import { Card, PageHeader } from "../../components/ui";

export function AboutVerificationPage() {
  const { data } = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/api/v1/directory/transparency", { auth: false }) });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="كيف نوثّق مقدّمي الخدمة" subtitle="التوثيق في سند إداري: نتحقق من المستندات وجهات إصدارها، لا نحكم على الكفاءة المهنية أو الشرعية." />
      <div className="grid gap-4">
        <Card>
          <h2 className="font-bold">١. الحساب أولاً، بلا مستندات</h2>
          <p className="mt-2 leading-8 text-muted">أي شخص ينشئ حساباً فوراً (بريد، جوجل، أو هاتف). هذا يثبت الهوية فقط — ولا يعني أي اعتماد مهني.</p>
        </Card>
        <Card>
          <h2 className="font-bold">٢. طلب الترقية بمستند شرعي</h2>
          <p className="mt-2 leading-8 text-muted">
            يقدّم <strong>الشيخ / الراقي الشرعي</strong> إجازة أو تزكية من جهة شرعية معروفة، مع جهة إصدارها.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">٣. مراجعة المنسق وتطابق المستند</h2>
          <p className="mt-2 leading-8 text-muted">
            يراجع منسق بتحقق ثنائي كل طلب. مستند خارج القائمة المسموحة يُرفض فوراً، لا يُعتمد "على أمل التصحيح".
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">٤. توثيق له تاريخ انتهاء</h2>
          <p className="mt-2 leading-8 text-muted">كل توثيق ينتهي ويُعاد التحقق منه. عند انتهائه يختفي الملف من الدليل تلقائياً حتى يُجدَّد.</p>
        </Card>
        <Card>
          <h2 className="font-bold">لا دفع، لا ترتيب مموَّل</h2>
          <p className="mt-2 leading-8 text-muted">ترتيب نتائج الدليل يُبنى فقط من مطابقة بحثك وحالة التوثيق. لا يوجد في سند أي آلية دفع أصلاً.</p>
        </Card>
      </div>
      {data && (
        <p className="mt-6 text-sm text-muted">
          الآن في الدليل: <span className="num">{data.publishedProviders}</span> شيخ وراقٍ و<span className="num">{data.publishedOrganizations}</span> جهة موثّقة.
        </p>
      )}
    </div>
  );
}

// النص المعتمد منشور على GitHub Pages (site/ في المستودع)؛ التطبيق والمتجر يشيران إليه أيضاً
const LEGAL_BASE = "https://sattuf.github.io/sanad";

function LegalPage({ title, summary, path }: { title: string; summary: string[]; path: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} />
      <Card>
        <ul className="list-inside list-disc space-y-2 leading-8">
          {summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <a className="mt-4 inline-block text-primary underline" href={`${LEGAL_BASE}${path}/`} target="_blank" rel="noopener noreferrer">
          النص الكامل
        </a>
      </Card>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="شروط الاستخدام"
      path="/terms"
      summary={[
        "سند مكتبة محتوى شرعي ورفيق للرقية والأذكار وطبقة حجز مع مختصين؛ لا يعد بأي نتيجة، والشفاء بيد الله وحده.",
        "لا يقدّم تشخيصاً ولا علاجاً طبياً، ولا يغني عن الطبيب.",
        "توثيق المختصين إداري، ولا يعني حكماً مهنياً أو شرعياً.",
        "سند مجاني بالكامل؛ لا اشتراكات ولا مدفوعات داخله.",
      ]}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="سياسة الخصوصية"
      path="/privacy"
      summary={[
        "لا إعلانات ولا متتبّعات، ولا نبيع بياناتك.",
        "مذكّرتك وتقدّمك على جهازك فقط؛ ملاحظتك للمختص ورسائلك محفوظة مشفّرة.",
        "كل اطلاع على ملاحظتك غير المختص يُسجَّل وتراه في حسابك.",
        "تحذف حسابك أو تصدّر بياناتك متى شئت من «حسابي».",
      ]}
    />
  );
}
