import { useEffect, useState } from "react";
import { hasApi } from "../api/client";
import { companionApi } from "../api/companion";
import { Btn, Hashiya, Sarlawh } from "../components/ornaments";

/*
  ادعم — content-guardrails.md §5. صفحة واحدة، بلا نوافذ منبثقة، ولا يظهر طلب الدعم داخل القارئ.
  الدعم لا يفتح أي ميزة ولا يغيّر شيئاً في التجربة. زر الدعم معطّل إلى أن تُعتمد الجهة المستقبِلة
  وتُراجَع سياسات متجري آبل وجوجل للتبرعات؛ لا يوجد هنا أي كود دفع.
*/
export function Support() {
  // رابط الدعم يُعدّ في الخادم (HTTPS فقط) ويفتح خارج التطبيق، كما تشترط سياسات المتاجر
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (hasApi) companionApi.config().then((c) => setUrl(c.supportUrl), () => {});
  }, []);

  return (
    <>
      <Sarlawh title="ادعم سند" />
      <main aria-labelledby="screen-title">
        <h2>سند مجاني، وسيبقى مجانياً</h2>
        <p>دعمك لا يفتح أي ميزة ولا يغيّر شيئاً في تجربتك. هو يساعد سند على البقاء متاحاً لغيرك.</p>
        <h3>أين يذهب الدعم</h3>
        <ul className="plain-list">
          <li>تشغيل الخوادم والمزامنة للختمات الجماعية</li>
          <li>مراجعة الخطط والنصوص شرعياً قبل نشرها</li>
          <li>حقوق التلاوات المسجّلة لقرّائها</li>
        </ul>
        <div style={{ marginTop: "1.5rem" }}>
          {url ? (
            <span className="btn-wrap">
              <a className="btn" href={url} target="_blank" rel="noreferrer noopener">
                ادعم سند
              </a>
            </span>
          ) : (
            <Btn disabled>ادعم سند</Btn>
          )}
        </div>
        <Hashiya>
          {url ? (
            <p>يفتح الدعم في صفحة الجهة المستقبِلة خارج التطبيق. وأجمل ما تدعم به سند أيضاً أن تدلّ عليه من يحتاجه.</p>
          ) : (
            <p>يُفعَّل زر الدعم بعد اعتماد الجهة المستقبِلة ومراجعة سياسات المتاجر. وإلى ذلك الحين، أجمل ما تدعم به سند أن تدلّ عليه من يحتاجه.</p>
          )}
        </Hashiya>
      </main>
    </>
  );
}
