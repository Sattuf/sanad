import { useState } from "react";
import { Colophon, Hashiya, SafetyNote, Sarlawh } from "../components/ornaments";
import { Rosette } from "../components/Rosette";
import { dailyPace, daysAtPace, doneCount, isComplete, JUZ_COUNT } from "../domain/khatma";
import { ajza, ar, days, hijri } from "../lib/arabic";
import { actions, useStore } from "../state/store";

const paceText = (n: number) => (n === 1 ? "جزء واحد" : n === 1.5 ? "جزء ونصف" : n === 2 ? "جزءان" : `${ar(n)} أجزاء`);

export function Khatma() {
  const khatma = useStore((s) => s.khatma);
  const [justDone, setJustDone] = useState<number | null>(null);
  const done = doneCount(khatma);
  const left = JUZ_COUNT - done;
  const pace = dailyPace(khatma);

  const toggle = (index: number) => {
    const wasDone = Boolean(khatma.juz.find((j) => j.index === index)?.doneAt);
    actions.toggleJuz(index);
    setJustDone(wasDone ? null : index);
  };

  return (
    <>
      <Sarlawh title="الختمة" />
      <main aria-labelledby="screen-title">
        <Rosette khatma={khatma} onToggle={toggle} justDone={justDone} />
        <p className="legend">انقر على الجزء حين تقرؤه، وانقر مرة أخرى لإلغائه.</p>

        {isComplete(khatma) ? (
          <>
            <Colophon
              label="تمّت الختمة"
              lines={["تمّت الختمة بحمد الله وتوفيقه", `في ${hijri(khatma.completedAt ? new Date(khatma.completedAt) : new Date(), false)}`, "نسأل الله القبول"]}
            />
            <p style={{ textAlign: "center" }}>
              <button type="button" className="link" onClick={() => actions.newKhatma()}>
                ابدأ ختمة جديدة
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="center-note">
              {done === 0 ? "ابدأ بالجزء الأول متى شئت." : `بقي ${ajza(left)}.`}{" "}
              {pace
                ? `لتختم في موعدك اقرأ نحو ${paceText(pace)} يومياً.`
                : `بجزء ونصف يومياً تختم في نحو ${days(daysAtPace(khatma))}.`}
            </p>
            <div className="field" style={{ justifyContent: "center" }}>
              <label htmlFor="target">أريد أن أختم قبل</label>
              <input
                id="target"
                type="date"
                value={khatma.targetDate?.slice(0, 10) ?? ""}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => actions.setKhatmaTarget(e.target.value ? `${e.target.value}T23:59:00` : undefined)}
              />
            </div>
          </>
        )}

        <Hashiya>
          <p>الختمة مع أسرتك أو أصدقائك برابط دعوة تأتي قريباً، لأنها تحتاج اتصالاً وحساباً اختيارياً. ختمتك هذه محفوظة على جهازك.</p>
        </Hashiya>
        <SafetyNote />
      </main>
    </>
  );
}
