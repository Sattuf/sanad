import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { EmergencyReferral, Transparency } from "../../api/types";
import { FALLBACK_REFERRAL } from "../../stores/emergency";
import { Card, PageHeader } from "../../components/ui";

/**
 * صفحة الطوارئ (A09) — بلا أي حركة أو زخرفة إطلاقاً: الوضوح الفوري أولاً (13 §13.4).
 * تعمل حتى إن تعذّر الوصول للخادم (أرقام احتياطية محلية).
 */
export function EmergencyPage() {
  const { data } = useQuery({
    queryKey: ["emergency-info"],
    queryFn: () => api.get<EmergencyReferral>("/api/v1/safety/emergency-info", { auth: false }),
    staleTime: Infinity,
  });
  const info = data ?? FALLBACK_REFERRAL;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-danger">إن كنت في خطر الآن</h1>
      <p className="mt-3 text-lg leading-8">{info.message}</p>
      <div className="mt-6 grid gap-3">
        {info.contacts.map((c) => (
          <a key={c.phoneNumber} href={`tel:${c.phoneNumber}`} className="flex items-center justify-between rounded-2xl border-2 border-danger bg-danger-bg px-5 py-4 text-danger">
            <span className="font-semibold">{c.label}</span>
            <span className="num text-2xl font-bold">{c.phoneNumber}</span>
          </a>
        ))}
      </div>
      <Card className="mt-6">
        <h2 className="font-bold">ما الذي يمكنك فعله الآن</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-8 text-muted">
          <li>اتصل بالطوارئ أو اذهب لأقرب قسم طوارئ.</li>
          <li>ابقَ مع شخص تثق به، ولا تبقَ وحدك.</li>
          <li>أبعد أي وسيلة قد تؤذيك عن متناولك.</li>
          <li>إن كان الخطر على شخص آخر (خصوصاً طفل)، أبلغ الجهات المختصة فوراً.</li>
        </ul>
      </Card>
      <p className="mt-6 text-sm text-muted">
        سند منصة توثيق وحجز إداري، وليست خدمة طوارئ أو علاج، ولا تتابع الرسائل لحظياً.
      </p>
    </div>
  );
}

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
          <h2 className="font-bold">٢. طلب الترقية باختيار النوع صراحة</h2>
          <p className="mt-2 leading-8 text-muted">
            يختار مقدّم الخدمة نوعه: <strong>طبيب مرخّص</strong> (رخصة مزاولة أو تسجيل لدى هيئة طبية) أو <strong>شيخ / راقٍ شرعي</strong> (إجازة أو
            تزكية من جهة شرعية معروفة). المساران متكافئان تماماً — لا أفضلية ظهور لأيٍّ منهما.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">٣. مراجعة المنسق وتطابق المستند</h2>
          <p className="mt-2 leading-8 text-muted">
            يراجع منسق بتحقق ثنائي كل طلب. مستند لا يطابق النوع المُعلَن (مثلاً: "طبيب" بتزكية شرعية) يُرفض فوراً، لا يُعتمد "على أمل التصحيح".
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
          الآن في الدليل: <span className="num">{data.publishedProviders}</span> مقدّم خدمة و<span className="num">{data.publishedOrganizations}</span> جهة موثّقة.
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
          <li>سند طبقة توثيق إداري ووساطة وحجز وإحالة، ومكتبة محتوى ديني محايد. لا تقدّم تشخيصاً ولا علاجاً ولا تعد بأي نتيجة.</li>
          <li>التوثيق إداري فقط، ولا يعني حكماً مهنياً أو شرعياً على مقدّم الخدمة.</li>
          <li>ممنوع نشر أي ادعاء علاجي أو وعد بشفاء أو وصف دواء أو جرعة، في أي نص بالمنصة.</li>
          <li>المحادثات إدارية وغير مراقَبة لحظياً؛ في حالات الخطر استخدم صفحة الطوارئ.</li>
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
          <li>لا يوجد في النظام أي تصنيف لحالتك الصحية أو الدينية.</li>
          <li>ملاحظة المختص الخاصة إشرافية، ولا يطّلع عليها إلا كاتبها والمشرف السريري أو المنسق عند تصعيد موثّق.</li>
          <li>يمكنك تصدير بياناتك أو حذف حسابك في أي وقت من صفحة "حسابي".</li>
          <li>عند وجود مؤشر خطر على حياة أو سلامة شخص، قد نعرض معلومات الطوارئ ونُعلم فريق التنسيق — السرية ليست مطلقة أمام واجب حماية الحياة.</li>
        </ul>
      </Card>
    </div>
  );
}
