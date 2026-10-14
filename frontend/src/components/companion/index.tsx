import { motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { ayahAudioUrl, expandRef, refLabel, type LibraryItem } from "../../content/library";
import { arNum } from "../../lib/dates";
import { cx } from "../../lib/cx";
import { usePlaylist } from "./audio";
import { ShareCardDialog, type CardContent } from "./share";

export function ProgressRing({ value, size = 64, stroke = 6, color = "var(--primary)", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduce = useReducedMotion();
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, currentColor 12%, transparent)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, color = "var(--primary)", label }: { value: number; color?: string; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress-track h-2.5 w-full overflow-hidden rounded-full" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: "scaleX(-1)" }}>
      <path d="M7 5v14l11-7z" />
    </svg>
  );
}

export function ShareButton({ content, className }: { content: CardContent; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-text", className)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
        </svg>
        بطاقة
      </button>
      {open && <ShareCardDialog content={content} onClose={() => setOpen(false)} />}
    </>
  );
}

/** آيات بخط عثماني كبير، مع تلاوة متتابعة وتظليل الآية الجارية وتكرار اختياري. */
export function VerseBlock({ refs, repeat = 1, large, showControls = true }: { refs: string[]; repeat?: number; large?: boolean; showControls?: boolean }) {
  const ayat = refs.flatMap(expandRef);
  let n = 0;
  const groups = refs.map((ref) => ({ ref, ayat: expandRef(ref).map((a) => ({ a, i: n++ })) }));
  const urls = ayat.map(ayahAudioUrl);
  const [times, setTimes] = useState(repeat);
  const player = usePlaylist(urls, times);
  const label = refs.map(refLabel).join("، ");

  return (
    <div className="flex flex-col gap-3">
      <div className={cx("quran flex flex-col gap-2 text-center", large ? "text-[1.75rem] md:text-[2rem]" : "text-[1.4rem] md:text-[1.6rem]")} dir="rtl">
        {groups.map((g) => (
          <p key={g.ref}>
            {g.ayat.map(({ a, i }) => (
              <span key={`${a.surah}:${a.ayah}`} className={cx("rounded-lg transition-colors", player.index === i && "bg-[color-mix(in_srgb,var(--lamp-glow)_35%,transparent)]")}>
                {a.text} <span className="text-[0.8em] text-primary">﴿{arNum(a.ayah)}﴾</span>{" "}
              </span>
            ))}
          </p>
        ))}
      </div>
      {showControls && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => (player.playing ? player.stop() : player.play())}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-semibold text-primary-contrast"
            aria-label={player.playing ? `إيقاف تلاوة ${label}` : `استمع: ${label}`}
          >
            <PlayIcon playing={player.playing} />
            {player.playing ? (player.loading ? "جارٍ التحميل…" : "إيقاف") : "استمع للتلاوة"}
          </button>
          <div className="flex items-center gap-1 rounded-full border border-border p-1" role="group" aria-label="عدد مرات التكرار">
            {[1, 3, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTimes(n)}
                aria-pressed={times === n}
                className={cx("num rounded-full px-2.5 py-0.5 text-xs font-semibold", times === n ? "bg-surface-2 text-primary" : "text-muted")}
              >
                ×{arNum(n)}
              </button>
            ))}
          </div>
          {player.playing && times > 1 && <span className="num text-xs text-muted">الجولة {arNum(player.round)} من {arNum(times)}</span>}
          {player.failed && <span className="text-xs text-warning">تعذّر التشغيل — تحقق من الاتصال</span>}
        </div>
      )}
      <p className="text-center text-xs text-muted">{label} · تلاوة مشاري العفاسي</p>
    </div>
  );
}

/** عدّاد تسبيح بلمسة — للأذكار ذات العدد الوارد فقط. */
export function TapCounter({ target, onComplete }: { target: number; onComplete?: () => void }) {
  const [n, setN] = useState(0);
  const done = n >= target;
  return (
    <button
      type="button"
      onClick={() => {
        if (done) return setN(0);
        const next = n + 1;
        setN(next);
        if (next === target) {
          navigator.vibrate?.(30);
          onComplete?.();
        }
      }}
      className={cx(
        "flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        done ? "border-transparent bg-success-bg text-success" : "border-border bg-surface hover:border-primary",
      )}
      aria-label={done ? "اكتمل العدد — اضغط لإعادة العد" : `اضغط مع كل مرة: ${n} من ${target}`}
    >
      <ProgressRing value={n / target} size={28} stroke={3} color={done ? "var(--success)" : "var(--primary)"} />
      <span className="num">
        {done ? "اكتمل ✓" : `${arNum(n)} / ${arNum(target)}`}
      </span>
    </button>
  );
}

export function SourceLine({ source }: { source?: string }) {
  if (!source) return null;
  return <p className="text-xs text-muted">المصدر: {source}</p>;
}

/** يعرض أي عنصر من المكتبة بحسب نوعه. */
export function ItemView({ item, large, onCounted }: { item: LibraryItem; large?: boolean; onCounted?: () => void }) {
  const share: CardContent | null =
    item.kind === "dhikr" && item.text
      ? { kicker: item.title, body: item.text, source: item.source }
      : item.kind === "verses" && item.refs && item.refs.length === 1
        ? { kicker: item.title, body: expandRef(item.refs[0]).map((a) => a.text).join(" ۝ "), source: refLabel(item.refs[0]), quran: true }
        : null;

  return (
    <div className="flex flex-col gap-3">
      {item.kind === "verses" && item.refs && <VerseBlock refs={item.refs} repeat={item.repeat} large={large} />}
      {item.kind === "dhikr" && item.text && <p className={cx("naskh text-center", large ? "text-2xl md:text-3xl" : "text-xl md:text-2xl")}>{item.text}</p>}
      {item.kind === "practice" && item.text && <p className="leading-8 text-muted">{item.text}</p>}
      {item.note && <p className="text-center text-sm text-muted">{item.note}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceLine source={item.source} />
        <div className="flex items-center gap-2">
          {item.kind === "dhikr" && item.repeat && item.repeat > 1 && <TapCounter target={item.repeat} onComplete={onCounted} />}
          {item.kind === "verses" && item.repeat && item.repeat > 1 && <span className="num text-xs text-muted">تُقرأ {arNum(item.repeat)} مرات</span>}
          {share && <ShareButton content={share} />}
        </div>
      </div>
    </div>
  );
}
