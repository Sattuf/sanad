import { useEffect, useState } from "react";
import { hasApi } from "../api/client";
import { companionApi, type GroupKhatma } from "../api/companion";
import { track } from "../lib/events";
import { href, navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { useAccount } from "../state/account";
import { members, NewGroupKhatma } from "./GroupKhatma";
import { Colophon, Hashiya, Sarlawh } from "../components/ornaments";
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
    if (!wasDone) {
      track("khatma_juz_done", "solo");
      if (done === 29) track("khatma_completed", "solo");
    }
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

        <GroupSection />
      </main>
    </>
  );
}

/** الختمات الجماعية: تحتاج حساباً لكل عضو. الختمة الفردية أعلاه تبقى على الجهاز دون حساب. */
function GroupSection() {
  const { signedIn } = useAccount();
  const [list, setList] = useState<GroupKhatma[]>(() => load<GroupKhatma[]>("groups", []));
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    companionApi.khatmas().then(
      (all) => {
        const groups = all.filter((k) => k.mode === "Group");
        setList(groups);
        save("groups", groups);
      },
      () => {},
    );
  }, [signedIn]);

  if (!hasApi) {
    return (
      <Hashiya>
        <p>ختمتك محفوظة على جهازك. الختمة مع أسرتك تحتاج نسخة سند المتصلة بالخادم.</p>
      </Hashiya>
    );
  }

  return (
    <>
      <h2>مع أسرتك</h2>
      {!signedIn ? (
        <Hashiya>
          <p>
            اختموا معاً: كل واحد يقرأ أجزاءه، والوردة تجمعكم.{" "}
            <a className="link" href={href({ name: "account" })}>
              ادخل إلى حسابك
            </a>{" "}
            لتنشئ ختمة أو تنضم إليها.
          </p>
        </Hashiya>
      ) : (
        <>
          {list.map((k, i) => (
            <a key={k.id} href={href({ name: "group", id: k.id })} className={`ruled-row${i === 0 ? " first" : ""}`}>
              <span>
                <span className="plan-title" style={{ display: "block" }}>{k.title}</span>
                <span className="plan-sub">{members(k.members.length)}</span>
              </span>
              <span className="plan-sub">
                {ar(k.doneCount)} / {ar(30)}
              </span>
            </a>
          ))}
          {creating ? (
            <NewGroupKhatma onCreated={(k) => navigate({ name: "group", id: k.id })} />
          ) : (
            <p style={{ marginTop: "1rem" }}>
              <button type="button" className="link" onClick={() => setCreating(true)}>
                {list.length ? "ختمة جديدة مع أسرتك" : "أنشئ ختمة مع أسرتك"}
              </button>
            </p>
          )}
        </>
      )}
    </>
  );
}
