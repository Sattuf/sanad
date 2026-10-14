import { useEffect, useState } from "react";
import { Btn, Colophon, Hashiya, SafetyNote, Sarlawh } from "../components/ornaments";
import { findPlan } from "../content/plans";
import { hijri } from "../lib/arabic";
import { href } from "../lib/router";
import { actions, getState, useStore } from "../state/store";

/** الترقيمة: شاشة إتمام الخطة، بلا قصاصات احتفال ولا نجوم. */
export function PlanDone() {
  const plan = findPlan(useStore((s) => s.enrollment?.planId));
  // التذكير بالدعم مرة واحدة لطيفة بعد إتمام أول خطة كاملة، ثم لا يعود.
  const [showSupport] = useState(() => !getState().supportNoteSeen && getState().plansCompleted >= 1);
  useEffect(() => {
    if (showSupport) actions.markSupportNoteSeen();
  }, [showSupport]);

  return (
    <>
      <Sarlawh title="تمّت الخطة" />
      <main aria-labelledby="screen-title">
        <Colophon
          label="تمّت الخطة"
          lines={[`تمّت «${plan?.title ?? "الخطة"}» بحمد الله`, `في ${hijri(new Date(), false)}`, "تقبّل الله منك", "وأدام عليك العافية"]}
        />
        <p style={{ textAlign: "center" }}>
          <Btn to={{ name: "plans" }}>اختر خطتك التالية</Btn>
        </p>
        <p style={{ textAlign: "center" }}>
          <a className="link" href={href({ name: "khatma" })}>
            أو أكمل ختمتك
          </a>
        </p>
        {showSupport && (
          <Hashiya>
            <p>
              سند مجاني وسيبقى كذلك. إن أحببت أن يبقى متاحاً لغيرك،{" "}
              <a className="link" href={href({ name: "support" })}>
                فهذه صفحة الدعم
              </a>
              .
            </p>
          </Hashiya>
        )}
        <SafetyNote />
      </main>
    </>
  );
}
