import { useEffect, useState } from "react";
import { Btn, Hashiya, Jadwal, SafetyNote, Sarlawh } from "../components/ornaments";
import { Misbaha } from "../components/Misbaha";
import { findAuthor, findPlan } from "../content/plans";
import { currentDay, doneToday, isFinished, isResuming } from "../domain/enrollment";
import { doneCount, JUZ_COUNT } from "../domain/khatma";
import { ar, minutes } from "../lib/arabic";
import { href } from "../lib/router";
import { useStore } from "../state/store";
import { Onboarding } from "./Onboarding";

/** اليوم الذي اكتمل للتو — لتتذهّب حبته مرة واحدة عند العودة من القارئ. */
export const flash: { day: number | null } = { day: null };

export function Today() {
  const enrollment = useStore((s) => s.enrollment);
  const onboarded = useStore((s) => s.settings.onboarded);
  const khatma = useStore((s) => s.khatma);
  const [justDone] = useState(() => flash.day);
  useEffect(() => {
    flash.day = null;
  }, []);

  if (!enrollment && !onboarded) return <Onboarding />;

  const plan = findPlan(enrollment?.planId);

  return (
    <>
      <Sarlawh title="ورد اليوم" />
      <main aria-labelledby="screen-title">
        {enrollment && plan ? (
          <Jadwal label="خطتك الحالية">
            <p className="plan-name">{plan.title}</p>
            <p className="meta">
              {isFinished(enrollment, plan)
                ? "أتممت الخطة كلها، تقبّل الله."
                : isResuming(enrollment)
                  ? `أكمل من حيث توقفت: اليوم ${ar(currentDay(enrollment, plan))}`
                  : `اليوم ${ar(currentDay(enrollment, plan))} من ${ar(plan.durationDays)}، نحو ${minutes(plan.minutesPerDay)}`}
            </p>
            <Misbaha
              total={plan.durationDays}
              done={enrollment.completedDays}
              current={isFinished(enrollment, plan) ? null : currentDay(enrollment, plan)}
              justDone={justDone}
            />
            {isFinished(enrollment, plan) ? (
              <Btn to={{ name: "plans" }}>اختر خطتك التالية</Btn>
            ) : doneToday(enrollment) ? (
              <>
                <p>أتممت ورد اليوم، تقبّل الله. وردك القادم جاهز متى شئت.</p>
                <a className="link" href={href({ name: "reader" })}>
                  اقرأ ورد اليوم {ar(currentDay(enrollment, plan))} الآن
                </a>
              </>
            ) : (
              <Btn to={{ name: "reader" }}>افتح ورد اليوم</Btn>
            )}
          </Jadwal>
        ) : (
          <Jadwal label="لا توجد خطة">
            <p className="plan-name">اختر خطتك الأولى</p>
            <p className="meta">أقصر الخطط سبعة أيام، وكل خطة يعدّها شيخ معروف.</p>
            <Btn to={{ name: "plans" }}>تصفّح الخطط</Btn>
          </Jadwal>
        )}

        <div className="ruled-row first" style={{ marginTop: "1.5rem" }}>
          <span>
            ختمتك: {ar(doneCount(khatma))} من {ar(JUZ_COUNT)} جزءاً
          </span>
          <a className="link" href={href({ name: "khatma" })}>
            الختمة
          </a>
        </div>

        {plan && (
          <Hashiya>
            <p>
              إعداد: {findAuthor(plan.authorId)?.displayName}.{" "}
              <a className="link" href={href({ name: "plan", id: plan.id })}>
                عن الخطة
              </a>
            </p>
          </Hashiya>
        )}
        <SafetyNote />
      </main>
    </>
  );
}
