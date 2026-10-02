import { Jadwal, Sarlawh } from "../components/ornaments";
import { emergencyContacts, safety } from "../content/safety";
import { href } from "../lib/router";

/** متى تحتاج مع الرقية إلى طبيب؟ / طوارئ — صفحة ثابتة يصل إليها المستخدم من الحاشية ومن السرلوح. */
export function Safety() {
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
            {emergencyContacts.map((c) => (
              <li key={c.phoneNumber}>
                {c.label}: <a href={`tel:${c.phoneNumber}`} dir="ltr">{c.phoneNumber}</a>
              </li>
            ))}
          </ul>
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
          <p className="plan-sub">{safety.reviewNote} وتُعرض أرقام الطوارئ حسب بلدك حين يُربط جدولها المعتمد.</p>
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
