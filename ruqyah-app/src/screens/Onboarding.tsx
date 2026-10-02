import { useState } from "react";
import { Btn, Jadwal, SafetyNote, Sarlawh } from "../components/ornaments";
import { MiniBeads } from "../components/Misbaha";
import { DURATIONS, findAuthor, plans, type Duration } from "../content/plans";
import { reminderLabels, type Reminder } from "../domain/enrollment";
import { days, minutes } from "../lib/arabic";
import { navigate } from "../lib/router";
import { actions } from "../state/store";

/*
  أول فتح، في أقل من دقيقة (product-spec.md §2): ترحيب، ثم سؤال واحد عن المدة، ثم اختيار الخطة،
  ثم وقت التذكير اختيارياً، ثم يفتح ورد اليوم الأول. لا سؤال عن الحالة ولا عن الأعراض في أي خطوة.
*/
type Step = "welcome" | "duration" | "plan" | "reminder";

export function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const [duration, setDuration] = useState<Duration | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const finish = (reminder?: Reminder) => {
    if (planId) actions.startPlan(planId, reminder);
    actions.updateSettings({ onboarded: true });
    navigate({ name: planId ? "reader" : "today" });
  };

  return (
    <>
      <Sarlawh title="سند" />
      <main aria-labelledby="screen-title">
        {step === "welcome" && (
          <Jadwal label="مرحباً">
            <p className="plan-name">مرحباً بك في سند</p>
            <p>سند يساعدك أن ترقي نفسك بنفسك، بورد يومي من خطة يعدّها شيخ معروف. مجاناً، ودون حساب.</p>
            <Btn onClick={() => setStep("duration")}>لنبدأ</Btn>
          </Jadwal>
        )}

        {step === "duration" && (
          <Jadwal label="المدة">
            <p className="plan-name">كم يوماً تريد أن تبدأ؟</p>
            <div className="choice-grid" role="group" aria-label="المدة">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={duration === d}
                  onClick={() => {
                    setDuration(d);
                    setStep("plan");
                  }}
                >
                  {days(d)}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => finish()}>
              أتصفّح الخطط بنفسي
            </button>
          </Jadwal>
        )}

        {step === "plan" && duration && (
          <Jadwal label="الخطط">
            <p className="plan-name">خطط {days(duration)}</p>
            <div role="radiogroup" aria-label="اختر خطة">
              {plans
                .filter((p) => p.durationDays === duration)
                .map((p, i) => (
                  <label key={p.id} className={`ruled-row${i === 0 ? " first" : ""}`} style={{ cursor: "pointer" }}>
                    <span style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                      <input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} style={{ marginTop: ".4rem" }} />
                      <span>
                        <span className="plan-title" style={{ display: "block" }}>{p.title}</span>
                        <span className="plan-sub" style={{ display: "block" }}>
                          {p.summary}، نحو {minutes(p.minutesPerDay)} يومياً
                        </span>
                        <span className="plan-sub" style={{ display: "block" }}>إعداد: {findAuthor(p.authorId)?.displayName}</span>
                      </span>
                    </span>
                    <MiniBeads n={p.durationDays} />
                  </label>
                ))}
            </div>
            <div className="row-actions">
              <button type="button" className="link" onClick={() => setStep("duration")}>
                رجوع
              </button>
              <Btn disabled={!planId} onClick={() => setStep("reminder")}>
                التالي
              </Btn>
            </div>
          </Jadwal>
        )}

        {step === "reminder" && (
          <Jadwal label="التذكير">
            <p className="plan-name">متى يناسبك وردك؟</p>
            <p className="meta">اختياري. يُحفظ اختيارك على جهازك، ويُستعمل لتذكير واحد هادئ في اليوم حين تُفعَّل التذكيرات.</p>
            <div className="choice-grid" role="group" aria-label="وقت التذكير">
              {(Object.keys(reminderLabels) as Reminder[]).map((r) => (
                <button key={r} type="button" className="chip" onClick={() => finish(r)}>
                  {reminderLabels[r]}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => finish()}>
              دون تذكير، افتح ورد اليوم
            </button>
          </Jadwal>
        )}

        <SafetyNote />
      </main>
    </>
  );
}
