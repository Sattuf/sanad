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

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="شروط الاستخدام (مسودة أكاديمية)" subtitle="نسخة 1.0 — تتطلب مراجعة قانونية محلية قبل أي تشغيل فعلي." />
      <Card>
        <ul className="list-inside list-disc space-y-2 leading-8">
          <li>سند طبقة توثيق إداري ووساطة وحجز، ومكتبة محتوى شرعي. لا تعد بأي نتيجة، والشفاء بيد الله وحده.</li>
          <li>التوثيق إداري فقط، ولا يعني حكماً مهنياً أو شرعياً على مقدّم الخدمة.</li>
          <li>ممنوع نشر أي وعد بشفاء أو بنتيجة مضمونة، في أي نص بالمنصة.</li>
          <li>المحادثات إدارية وغير مراقَبة لحظياً.</li>
          <li>سند مجانية بالكامل؛ لا اشتراكات ولا خدمات مدفوعة داخلها.</li>
        </ul>
      </Card>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="سياسة الخصوصية (مسودة أكاديمية)" subtitle="نسخة 1.0 — تتطلب مراجعة قانونية محلية قبل أي تشغيل فعلي." />
      <Card>
        <ul className="list-inside list-disc space-y-2 leading-8">
          <li>ملاحظاتك للمختص، ورسائلك، والتوصيات الموجّهة لك تُحفظ مشفّرة، ولا تظهر في السجلات.</li>
          <li>لا يوجد في النظام أي تصنيف لحالتك.</li>
          <li>ملاحظة المختص الخاصة لا يطّلع عليها إلا كاتبها، أو المنسق عند تصعيد موثّق.</li>
          <li>يمكنك تصدير بياناتك أو حذف حسابك في أي وقت من صفحة "حسابي".</li>
        </ul>
      </Card>
    </div>
  );
}
