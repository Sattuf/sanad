import { useEffect, useState, type ReactNode } from "react";
import { quran, type QuranKey } from "@sanad/shared/content/quran";
import { Counter } from "../components/Counter";
import { Btn, Hashiya, Jadwal, Sarlawh } from "../components/ornaments";
import { findPlan, type WirdItem } from "../content/plans";
import { currentDay, isFinished } from "../domain/enrollment";
import { ar } from "../lib/arabic";
import { href, navigate } from "../lib/router";
import { actions, readerCounts, useStore } from "../state/store";
import { flash } from "./Today";
import { track } from "../lib/events";
import { download, isDownloaded, player, RECITATION_SOURCE, recitationAvailable, reciters, usePlayer } from "../lib/recitation";

const BASMALA = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";
const itemKey = (i: number) => `i${i}`;

/** منع إطفاء الشاشة أثناء القراءة، حيث يدعمه المتصفح. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);
}

export function Reader() {
  useWakeLock();
  useEffect(() => () => player.stop(), []);
  const enrollment = useStore((s) => s.enrollment);
  const scale = useStore((s) => s.settings.quranScale);
  const plan = findPlan(enrollment?.planId);
  const day = enrollment && plan ? currentDay(enrollment, plan) : 0;
  const reader = useStore((s) => s.reader);
  const counts = plan ? readerCounts({ reader }, plan.id, day) : {};

  if (!enrollment || !plan || isFinished(enrollment, plan)) {
    return (
      <>
        <Sarlawh title="الورد" />
        <main>
          <p className="center-note">اختر خطة ليظهر وردك هنا.</p>
          <p style={{ textAlign: "center" }}>
            <Btn to={{ name: "plans" }}>تصفّح الخطط</Btn>
          </p>
        </main>
      </>
    );
  }

  const items = plan.days[day - 1].items;
  const countable = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind !== "note");
  const allDone = countable.every(({ it, i }) => (counts[itemKey(i)] ?? 0) >= (it as { repeat: number }).repeat);

  const finish = () => {
    const finishedPlan = actions.completeWird();
    track("wird_completed", String(plan.durationDays));
    if (finishedPlan) track("plan_completed", String(plan.durationDays));
    flash.day = day;
    navigate(finishedPlan ? { name: "planDone" } : { name: "today" });
  };

  const setScale = (v: number) => actions.updateSettings({ quranScale: Math.min(1.5, Math.max(1, Math.round(v * 10) / 10)) });

  return (
    <>
      <Sarlawh title="الورد" />
      <main className="reader" aria-labelledby="screen-title" style={{ ["--quran-scale" as string]: scale }}>
        <p className="meta" style={{ color: "var(--ink-soft)", margin: ".25rem 0 0" }}>
          {plan.title} — اليوم {ar(day)} من {ar(plan.durationDays)}
        </p>
        <div className="scale" role="group" aria-label="حجم خط القرآن">
          <span>حجم الخط</span>
          <button type="button" onClick={() => setScale(scale - 0.1)} disabled={scale <= 1} aria-label="تصغير">
            −
          </button>
          <span aria-live="polite">{ar(Math.round(scale * 100))}٪</span>
          <button type="button" onClick={() => setScale(scale + 0.1)} disabled={scale >= 1.5} aria-label="تكبير">
            +
          </button>
        </div>

        {recitationAvailable() && <AudioBar keys={items.filter((i) => i.kind === "quran").map((i) => (i as { key: QuranKey }).key)} />}

        <Jadwal label="ورد اليوم">
          {items.map((it, i) => (
            <Block key={i} item={it} count={counts[itemKey(i)] ?? 0} onTap={(n) => actions.setCount(plan.id, day, itemKey(i), n)} />
          ))}
        </Jadwal>
        <p className="plan-sub" style={{ textAlign: "center", marginTop: ".5rem" }}>
          النص القرآني بالرسم العثماني من موسوعة القرآن الكريم (QuranEnc)، رخصة CC BY-SA 4.0. والأذكار مع تخريجها.
        </p>

        <div className="row-actions">
          <a className="link" href={href({ name: "today" })}>
            رجوع
          </a>
          <Btn onClick={finish} disabled={!allDone}>
            أتممت ورد اليوم
          </Btn>
        </div>
        {!allDone && (
          <p style={{ textAlign: "end", marginTop: ".75rem" }}>
            <button type="button" className="link" onClick={finish}>
              قرأته من مصحفي — سجّل الورد مكتملاً
            </button>
          </p>
        )}
      </main>
    </>
  );
}

function Block({ item, count, onTap }: { item: WirdItem; count: number; onTap: (n: number) => void }) {
  if (item.kind === "note") {
    return (
      <div className="block">
        <div className="author-note">
          <Hashiya>
            <p>{item.text}</p>
          </Hashiya>
        </div>
      </div>
    );
  }

  const head = (
    <div className="block-head">
      <span>{item.title}</span>
    </div>
  );

  if (item.kind === "quran") {
    return <QuranBlock item={item} count={count} onTap={onTap} head={head} />;
  }

  return (
    <article className="block" aria-label={item.title}>
      {head}
      <p className="dhikr">{item.text}</p>
      <Counter title={item.title} count={count} target={item.repeat} onTap={() => onTap(count + 1)} />
      <p className="source">{item.source}</p>
      {item.note && <p className="item-note">{item.note}</p>}
    </article>
  );
}

function QuranBlock({ item, count, onTap, head }: {
  item: Extract<WirdItem, { kind: "quran" }>; count: number; onTap: (n: number) => void; head: ReactNode;
}) {
  const playing = usePlayer();
  const p = quran[item.key];
  const active = playing.key === item.key;
  const withBasmala = p.from === 1 && p.surah !== 1 && p.surah !== 9;
  return (
    <article className="block" aria-label={item.title}>
      {head}
      {withBasmala && <p className="basmala">{BASMALA}</p>}
      <p className="ayat">
        {p.ayat.map((a, n) => (
          <span key={n} className={active && playing.ayah === n ? "now-reciting" : undefined}>
            {a} <span className="end">﴿{ar(p.from + n)}﴾</span>{" "}
          </span>
        ))}
      </p>
      <Counter title={item.title} count={count} target={item.repeat} onTap={() => onTap(count + 1)} />
      {recitationAvailable() && (
        <p className="listen">
          <button type="button" className="link" onClick={() => player.toggle(item.key)} aria-pressed={active && playing.status === "playing"}>
            {active && playing.status === "playing" ? "أوقف التلاوة" : active && playing.status === "paused" ? "تابع الاستماع" : "استمع"}
          </button>
          {active && playing.status === "loading" && <span className="plan-sub"> — لحظة…</span>}
          {active && playing.status === "error" && <span className="plan-sub"> — تعذّر تشغيل التلاوة الآن.</span>}
        </p>
      )}
      <p className="source">
        سورة {p.surahName}، {p.from === p.to ? `الآية ${ar(p.from)}` : `الآيات ${ar(p.from)}–${ar(p.to)}`}
      </p>
      {item.note && <p className="item-note">{item.note}</p>}
    </article>
  );
}

/** شريط التلاوة: القارئ، والمصدر تحت المشغّل، وتحميل تلاوات ورد اليوم للعمل دون اتصال. */
function AudioBar({ keys }: { keys: QuranKey[] }) {
  const { reciter } = usePlayer();
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const k = keys.join(",");
  useEffect(() => {
    let live = true;
    void isDownloaded(keys).then((v) => live && setSaved(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, reciter]);
  if (keys.length === 0) return null;
  const name = reciters.find((r) => r.id === reciter)?.name;

  return (
    <div className="audio-bar">
      <label>
        القارئ{" "}
        <select value={reciter} onChange={(e) => player.setReciter(e.target.value)}>
          {reciters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {saved ? (
        <span className="plan-sub">تلاوات ورد اليوم محفوظة على جهازك.</span>
      ) : (
        <button
          type="button"
          className="link"
          disabled={progress !== null}
          onClick={async () => {
            await download(keys, (d, t) => setProgress(`${ar(d)} / ${ar(t)}`));
            setProgress(null);
            setSaved(await isDownloaded(keys));
          }}
        >
          {progress ? `يُحمَّل ${progress}` : "حمّل التلاوات لتعمل دون اتصال"}
        </button>
      )}
      <p className="plan-sub" style={{ margin: 0 }}>
        بصوت {name}، من {RECITATION_SOURCE} عبر خادم سند.
      </p>
    </div>
  );
}
