import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Checkbox, PageHeader } from "../../components/ui";
import { removeKey } from "../../lib/safeStorage";
import { vault } from "../../lib/vault";
import { useDiscreet } from "../../stores/discreet";
import { useJournal } from "../../stores/journal";

/** الخصوصية والتمويه — ماذا يُحفظ وأين، والوضع المتحفّظ، والخروج السريع. */
export function PrivacyModePage() {
  const { on, set } = useDiscreet();
  const [wiped, setWiped] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الخصوصية والتمويه" subtitle="رحلتك شأن خاص بك. هذه أدوات تجعل سند هادئاً ومتحفّظاً على شاشتك أمام الآخرين." />
      <div className="flex flex-col gap-4">
        <Card>
          <Checkbox
            id="discreet"
            checked={on}
            onChange={set}
            label={<strong>الوضع المتحفّظ</strong>}
            hint="يظهر التبويب باسم «ملاحظاتي» وبأيقونة محايدة، وتُستبدل التسميات مثل «الرقية» بأخرى عامة، ويُفعَّل الخروج السريع."
          />
        </Card>
        <Card>
          <h2 className="font-bold">الخروج السريع</h2>
          <p className="mt-1 text-sm leading-7 text-muted">
            في الوضع المتحفّظ: اضغط <kbd className="rounded border border-border px-1.5">Esc</kbd> مرتين بسرعة، أو زر «✕» أعلى الصفحة، فتنتقل فوراً لصفحة بحث
            عادية دون أن تبقى سند في زر الرجوع.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">أين تُحفظ بياناتك؟</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-7 text-muted">
            <li><strong className="text-text">مذكّرتي:</strong> مشفّرة على جهازك فقط برمزك أو بصمتك. لا تصل لخوادمنا أبداً.</li>
            <li><strong className="text-text">تقدّم البرامج ونتيجة الاختبار:</strong> على جهازك فقط، بلا حساب.</li>
            <li><strong className="text-text">التلاوات المحفوظة:</strong> نسخ صوتية على جهازك لتعمل دون إنترنت.</li>
            <li>لا نستخدم أدوات تتبّع أو إعلانات في هذه الصفحات.</li>
          </ul>
          <Link to="/journal" className="mt-3 inline-block text-sm font-semibold text-primary">إعدادات قفل المذكّرة بالبصمة ←</Link>
        </Card>
        <Card>
          <h2 className="font-bold">ثبّت سند على الشاشة الرئيسية</h2>
          <p className="mt-1 text-sm leading-7 text-muted">
            من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية». يظهر التطبيق باسم «سند» وأيقونة هادئة، ويفتح وضع السكينة حتى دون إنترنت.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold text-danger">مسح كل بياناتي من هذا الجهاز</h2>
          <p className="mt-1 text-sm text-muted">يحذف المذكّرة والتقدّم والتلاوات المحفوظة. لا يمكن التراجع.</p>
          {wiped ? (
            <p className="mt-3 text-sm font-semibold text-success" role="status">مُسحت البيانات المحلية.</p>
          ) : !confirm ? (
            <Button variant="ghost" className="mt-3 text-danger" onClick={() => setConfirm(true)}>مسح…</Button>
          ) : (
            <Button
              variant="danger"
              className="mt-3"
              onClick={async () => {
                useJournal.getState().lock();
                vault.destroy();
                ["sanad.companion.v1", "sanad.discreet"].forEach(removeKey);
                if ("caches" in window) await caches.delete("sanad-audio-v1").catch(() => undefined);
                setWiped(true);
                setTimeout(() => location.assign("/"), 800);
              }}
            >
              تأكيد المسح النهائي
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
