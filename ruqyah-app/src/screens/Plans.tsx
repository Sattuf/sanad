import { useState } from "react";
import { Btn, Hashiya, SafetyNote, Sarlawh } from "../components/ornaments";
import { MiniBeads } from "../components/Misbaha";
import { authors, DURATIONS, findAuthor, findPlan, isDraft, plans, type Duration, type Plan } from "../content/plans";
import { safety } from "../content/safety";
import { reminderLabels, type Reminder } from "../domain/enrollment";
import { ar, days, minutes } from "../lib/arabic";
import { href, navigate } from "../lib/router";
import { actions, useStore } from "../state/store";

/** قائمة الخطط: تصفية بالمدة وبالمعدّ فقط، وأسطر مسطّرة لا بطاقات. */
export function Plans() {
  const [duration, setDuration] = useState<Duration | 0>(0);
  const [authorId, setAuthorId] = useState<string>("");
  const activeId = useStore((s) => s.enrollment?.planId);
  const shown = plans.filter((p) => (!duration || p.durationDays === duration) && (!authorId || p.authorId === authorId));

  return (
    <>
      <Sarlawh title="الخطط" />
      <main aria-labelledby="screen-title">
        <h2>اختر خطتك</h2>
        <div className="chips" role="group" aria-label="المدة">
          {[0, ...DURATIONS].map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={duration === d} onClick={() => setDuration(d as Duration | 0)}>
              {d === 0 ? "كل المدد" : days(d)}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="المعدّ">
          {[{ id: "", displayName: "كل المعدّين" }, ...authors].map((a) => (
            <button key={a.id} type="button" className="chip" aria-pressed={authorId === a.id} onClick={() => setAuthorId(a.id)}>
              {a.displayName}
            </button>
          ))}
        </div>

        <div>
          {shown.map((p, i) => (
            <a key={p.id} href={href({ name: "plan", id: p.id })} className={`ruled-row${i === 0 ? " first" : ""}`}>
              <span>
                <p className="plan-title">
                  {p.title} {activeId === p.id && <span className="draft-tag">خطتي</span>}
                </p>
                <p className="plan-sub">{p.summary}</p>
                <p className="plan-sub">
                  {days(p.durationDays)}، نحو {minutes(p.minutesPerDay)} يومياً
                </p>
                <p className="plan-sub">إعداد: {findAuthor(p.authorId)?.displayName}</p>
              </span>
              <MiniBeads n={p.durationDays} />
            </a>
          ))}
          {shown.length === 0 && <p className="center-note">لا توجد خطة بهذه المدة لهذا المعدّ بعد. جرّب مدة أخرى.</p>}
        </div>

        <Hashiya>
          <p>كل خطة تُنشر باسم معدّها وبإذنه المكتوب. {safety.planNotice}</p>
        </Hashiya>
        <SafetyNote />
      </main>
    </>
  );
}

/** صفحة الخطة: من أعدّها، الإذن، المحتوى اليومي، المدة، تنبيه العلاج، وزر البدء. */
export function PlanDetail({ id }: { id: string }) {
  const plan = findPlan(id);
  const enrollment = useStore((s) => s.enrollment);
  const [reminder, setReminder] = useState<Reminder | "">(enrollment?.reminder ?? "");

  if (!plan) {
    return (
      <>
        <Sarlawh title="الخطط" />
        <main>
          <p className="center-note">لم نجد هذه الخطة.</p>
          <p style={{ textAlign: "center" }}>
            <a className="link" href={href({ name: "plans" })}>
              العودة إلى الخطط
            </a>
          </p>
        </main>
      </>
    );
  }

  const author = findAuthor(plan.authorId);
  const isActive = enrollment?.planId === plan.id;
  const start = () => {
    if (enrollment && !isActive && !window.confirm(`ستتوقف خطتك الحالية وتبدأ «${plan.title}». هل تريد المتابعة؟`)) return;
    actions.startPlan(plan.id, reminder || undefined);
    actions.updateSettings({ onboarded: true });
    navigate({ name: "reader" });
  };

  return (
    <>
      <Sarlawh title="الخطة" />
      <main aria-labelledby="screen-title">
        <h2>{plan.title}</h2>
        {isDraft(plan) && <p className="draft-tag">خطة تجريبية — تُنشر بعد إذن المعدّ المكتوب والمراجعة الشرعية</p>}
        <p>{plan.contents}</p>

        <ul className="facts">
          <li>
            <span>المدة</span>
            <span>{days(plan.durationDays)}</span>
          </li>
          <li>
            <span>الورد اليومي</span>
            <span>نحو {minutes(plan.minutesPerDay)}</span>
          </li>
          <li>
            <span>مقاطع اليوم الأول</span>
            <span>{ar(itemCount(plan))}</span>
          </li>
          <li>
            <span>إعداد</span>
            <span>{author?.displayName}</span>
          </li>
          <li>
            <span>تاريخ الإذن</span>
            <span>{author?.consentDate ? new Date(author.consentDate).toLocaleDateString("ar-EG") : "بانتظار الإذن المكتوب"}</span>
          </li>
          <li>
            <span>الإصدار</span>
            <span>{ar(plan.version)}</span>
          </li>
        </ul>
        {author && <p className="plan-sub" style={{ marginTop: ".75rem" }}>{author.bio}</p>}

        <Hashiya>
          <p>
            <strong>{safety.planNotice}</strong> {safety.medication}
          </p>
        </Hashiya>

        <div className="field">
          <label htmlFor="reminder">وقت التذكير (اختياري)</label>
          <select id="reminder" value={reminder} onChange={(e) => setReminder(e.target.value as Reminder | "")} className="chip">
            <option value="">دون تذكير</option>
            {(Object.keys(reminderLabels) as Reminder[]).map((r) => (
              <option key={r} value={r}>
                {reminderLabels[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="row-actions">
          {isActive ? (
            <>
              <Btn to={{ name: "reader" }}>افتح ورد اليوم</Btn>
              <button
                type="button"
                className="link"
                onClick={() => {
                  if (window.confirm("هل تريد إيقاف هذه الخطة؟ يمكنك البدء بغيرها متى شئت.")) {
                    actions.stopPlan();
                    navigate({ name: "plans" });
                  }
                }}
              >
                أوقف الخطة
              </button>
            </>
          ) : (
            <>
              <Btn onClick={start}>ابدأ الخطة</Btn>
              <a className="link" href={href({ name: "plans" })}>
                رجوع
              </a>
            </>
          )}
        </div>
        <SafetyNote />
      </main>
    </>
  );
}

const itemCount = (p: Plan) => p.days[0].items.filter((i) => i.kind !== "note").length;
