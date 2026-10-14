import { useEffect, useState } from "react";
import { hasApi } from "../api/client";
import { companionApi, type EmergencyContacts } from "../api/companion";
import { Jadwal, Sarlawh } from "../components/ornaments";
import { emergencyContacts as bundledContacts, safety } from "../content/safety";
import { countryFromLocale } from "../lib/country";
import { track } from "../lib/events";
import { href } from "../lib/router";
import { load, save } from "../lib/storage";
import { useStore } from "../state/store";

/**
 * متى تحتاج مع الرقية إلى طبيب؟ / طوارئ — صفحة ثابتة يصل إليها المستخدم من الحاشية ومن السرلوح.
 * الأرقام حسب البلد من جدول تعتمده الإدارة (موظف يُدخل وآخر يعتمد)، وتُحفظ آخر نسخة لتظهر دون اتصال.
 * دون اتصال ولا نسخة محفوظة: الجهة الاحتياطية المعتمدة في الحزمة المشتركة.
 */
export function Safety() {
  const chosen = useStore((s) => s.country);
  const country = chosen ?? countryFromLocale();
  const [data, setData] = useState<EmergencyContacts | null>(() => load<EmergencyContacts | null>(`emergency:${country ?? "-"}`, null));

  useEffect(() => {
    track("safety_page_opened", "other");
  }, []);

  useEffect(() => {
    if (!hasApi) return;
    companionApi.emergency(country ?? undefined).then(
      (d) => {
        setData(d);
        save(`emergency:${country ?? "-"}`, d);
      },
      () => {},
    );
  }, [country]);

  const contacts = data?.contacts.length ? data.contacts : bundledContacts;

  return (
    <>
      <Sarlawh title="طوارئ" />
      <main aria-labelledby="safety-title" className="safety">
        <Jadwal label={safety.title}>
          <h2 id="safety-title" style={{ marginTop: 0 }}>
            {safety.title}
          </h2>
          <p>{safety.intro}</p>
          <p className="urgent">
            <strong>{safety.urgent}</strong>
          </p>
          <ul className="contacts plain-list" aria-label="أرقام الطوارئ">
            {contacts.map((c) => (
              <li key={c.label + c.phoneNumber}>
                {c.label}: <a href={`tel:${c.phoneNumber}`} dir="ltr">{c.phoneNumber}</a>
              </li>
            ))}
          </ul>
          {(!data || data.isFallback) && (
            <p className="plan-sub">
              لم نجد رقماً معتمداً لبلدك بعد. {" "}
              <a className="link" href={href({ name: "account" })}>
                اختر بلدك
              </a>
            </p>
          )}
          <p style={{ margin: "1rem 0 .25rem" }}>
            <strong>استشر طبيباً إذا:</strong>
          </p>
          <ul>
            {safety.consultIf.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p>
            <strong>{safety.medication}</strong>
          </p>
          <p className="plan-sub">{safety.reviewNote}</p>
        </Jadwal>
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <a className="link" href={href({ name: "today" })}>
            العودة إلى ورد اليوم
          </a>
        </p>
      </main>
    </>
  );
}
