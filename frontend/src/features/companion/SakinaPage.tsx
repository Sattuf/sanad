import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cachedCount, precacheAudio, usePlaylist } from "../../components/companion/audio";
import type { QuranKey } from "@sanad/shared/content/quran";
import { ayahAudioUrl, expandRef, item } from "../../content/library";
import { cx } from "../../lib/cx";
import { arNum } from "../../lib/dates";

/*
  وضع السكينة — لمن يشعر بضيق مفاجئ أو فزع ليلي أو أرق.
  شاشة خافتة جداً، ذكر بتمهّل، وآيات وأدعية بصوت هادئ. يعمل بلا إنترنت بعد أول زيارة
  (التطبيق عبر Service Worker، والتلاوات عبر Cache API).
*/
type Need = "distress" | "night" | "sleep";

const NEEDS: Record<Need, { label: string; items: string[]; verses: QuranKey[] }> = {
  distress: { label: "ضيق مفاجئ", items: ["dua-karb", "dhunnun", "ya-hayy"], verses: ["baqarah-248", "tawbah-26", "tawbah-40", "fath-4", "fath-18", "fath-26", "raad-28"] as QuranKey[] },
  night: { label: "استيقظت فزعاً", items: ["faza", "bad-dream"], verses: ["kursi", "falaq", "nas"] as QuranKey[] },
  sleep: { label: "لا أستطيع النوم", items: ["bismika", "sleep-nafth"], verses: ["kursi", "baqarah-285-286", "ikhlas", "falaq", "nas"] as QuranKey[] },
};

const ALL_AUDIO = [...new Set(Object.values(NEEDS).flatMap((n) => n.verses.flatMap(expandRef).map(ayahAudioUrl)))];

/*
  ذكر بتمهّل بدل تمارين التنفّس: الدائرة تنبض نبضاً هادئاً يضبط إيقاع الترديد،
  والعدّ بلمسة كالمسبحة — لا عدّ آلي ولا أي طقس، ذكر مأثور فقط بمصدره.
*/
const PACED_DHIKR = [
  { text: "أستغفر الله", source: "صحيح مسلم (2702)" },
  { text: "لا إله إلا الله", source: "«أفضل الذكر لا إله إلا الله» — سنن الترمذي (3383)" },
  { text: "سبحان الله وبحمده", source: "صحيح البخاري (6405) وصحيح مسلم (2691)" },
  { text: "لا حول ولا قوة إلا بالله", source: "«كنز من كنوز الجنة» — صحيح البخاري (6384)" },
] as const;

const PULSE_SECONDS = 5;

function PacedDhikr() {
  const reduce = useReducedMotion();
  const [which, setWhich] = useState(0);
  const [count, setCount] = useState(0);
  const d = PACED_DHIKR[which];

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => {
          setCount((c) => c + 1);
          navigator.vibrate?.(10);
        }}
        className="relative flex h-64 w-64 items-center justify-center rounded-full"
        aria-label={`${d.text} — اضغط مع كل مرة، العدد ${count}`}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,199,191,0.35) 0%, rgba(124,199,191,0.08) 60%, transparent 72%)" }}
          animate={reduce ? undefined : { scale: [0.6, 1, 0.6] }}
          transition={{ duration: PULSE_SECONDS, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          aria-hidden
          className="absolute rounded-full border border-[rgba(124,199,191,0.5)]"
          style={{ width: "70%", height: "70%" }}
          animate={reduce ? undefined : { scale: [0.65, 1.1, 0.65], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: PULSE_SECONDS, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="relative text-center">
          <span className="naskh block px-6 text-[1.7rem] leading-[1.8] text-[#e6f1ef]">{d.text}</span>
          <span className="num mt-1 block text-3xl font-light text-[#9fc9c3]">{arNum(count)}</span>
        </span>
      </button>
      <p className="text-sm text-[#8aa3ad]">ردّد بتمهّل مع نبض الدائرة، والمسها مع كل مرة</p>
      <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="اختر الذكر">
        {PACED_DHIKR.map((x, i) => (
          <button
            key={x.text}
            type="button"
            aria-pressed={which === i}
            onClick={() => {
              setWhich(i);
              setCount(0);
            }}
            className={cx("rounded-full px-3 py-1 text-xs", which === i ? "bg-[rgba(124,199,191,0.18)] text-white" : "text-[#8aa3ad]")}
          >
            {x.text}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[#6f8994]">{d.source}</p>
    </div>
  );
}

export function SakinaPage() {
  const [params, setParams] = useSearchParams();
  const need = (params.get("for") as Need) in NEEDS ? (params.get("for") as Need) : "distress";
  const cfg = NEEDS[need];
  const urls = cfg.verses.flatMap(expandRef).map(ayahAudioUrl);
  const player = usePlaylist(urls, 3);
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const [offline, setOffline] = useState<{ cached: number; busy: boolean }>({ cached: 0, busy: false });
  const dhikr = item(cfg.items[idx % cfg.items.length]);

  useEffect(() => {
    void cachedCount(ALL_AUDIO).then((n) => setOffline((o) => ({ ...o, cached: n })));
  }, []);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#0b141c";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div className="min-h-dvh text-[#dfe9ec]" style={{ background: "radial-gradient(ellipse at 50% 0%, #15283a 0%, #0b141c 60%, #070d12 100%)" }}>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-5">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => (history.length > 1 ? navigate(-1) : navigate("/"))} className="rounded-full px-3 py-2 text-sm text-[#8aa3ad] hover:text-white">
            → خروج
          </button>
          <p className="text-sm font-semibold text-[#9fc9c3]">سكينة</p>
          <span className="w-16" aria-hidden />
        </header>

        <nav className="mt-4 flex justify-center gap-2" aria-label="ما الذي تمرّ به؟">
          {(Object.keys(NEEDS) as Need[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                player.stop();
                setIdx(0);
                setParams({ for: n }, { replace: true });
              }}
              aria-pressed={need === n}
              className={cx("rounded-full px-4 py-2 text-sm", need === n ? "bg-[rgba(124,199,191,0.18)] text-white" : "text-[#8aa3ad]")}
            >
              {NEEDS[n].label}
            </button>
          ))}
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
          <PacedDhikr />

          <button
            type="button"
            onClick={() => setIdx((i) => i + 1)}
            className="w-full rounded-3xl bg-white/[0.04] px-6 py-6 text-center"
            aria-label="الذكر التالي"
          >
            <p className="text-xs text-[#8aa3ad]">{dhikr.title}</p>
            <p className="naskh mt-2 text-2xl leading-[2.3] text-[#eef4f3]">{dhikr.text}</p>
            <p className="mt-2 text-[11px] text-[#6f8994]">{dhikr.source} · المس للذكر التالي</p>
          </button>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => (player.playing ? player.stop() : player.play())}
              className="flex items-center gap-3 rounded-full border border-[rgba(124,199,191,0.4)] px-6 py-3 text-[#cfe6e2]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(124,199,191,0.25)]" aria-hidden>
                {player.playing ? "❚❚" : "▶"}
              </span>
              {player.playing ? (player.loading ? "جارٍ التحميل…" : "إيقاف التلاوة") : need === "distress" ? "استمع لآيات السكينة" : "استمع لآيات التحصين"}
            </button>
            {player.failed && <p className="text-xs text-[#f2c675]">تعذّر تشغيل التلاوة — احفظها للاستخدام دون إنترنت حين يتوفر الاتصال.</p>}
          </div>
        </main>

        <footer className="flex flex-col items-center gap-2 pb-2 text-center text-xs text-[#6f8994]">
          {offline.cached < ALL_AUDIO.length ? (
            <button
              type="button"
              disabled={offline.busy}
              onClick={async () => {
                setOffline((o) => ({ ...o, busy: true }));
                await precacheAudio(ALL_AUDIO, (n) => setOffline({ cached: n, busy: true }));
                setOffline({ cached: await cachedCount(ALL_AUDIO), busy: false });
              }}
              className="rounded-full px-3 py-1.5 text-[#9fc9c3] underline-offset-4 hover:underline"
            >
              {offline.busy ? `جارٍ الحفظ… ${arNum(offline.cached)}/${arNum(ALL_AUDIO.length)}` : "احفظ التلاوات للاستخدام دون إنترنت"}
            </button>
          ) : (
            <p className="text-[#9fc9c3]">التلاوات محفوظة على جهازك ✓ تعمل دون إنترنت</p>
          )}
        </footer>
      </div>
    </div>
  );
}
