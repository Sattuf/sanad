import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../api/client";
import { useSession } from "../stores/session";
import { formatDuration } from "@sanad/shared/lib/format";

/**
 * مشغّل خفيف فوق عنصر <audio> الأصلي — بلا مكتبة ثقيلة (references/10-frontend-architecture.md §10.2).
 * requiresAuth: لمعاينة مقطع غير منشور (ContentManager) — عنصر <audio> لا يرسل ترويسة Authorization،
 * فنجلب الملف كـ Blob بالرمز ثم نشغّله محلياً.
 */
export function AudioPlayer({ src, title, durationSeconds, requiresAuth }: { src: string; title: string; durationSeconds: number; requiresAuth?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const duration = ref.current?.duration && Number.isFinite(ref.current.duration) ? ref.current.duration : durationSeconds;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onEnd = () => setPlaying(false);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = () => setFailed(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const toggle = async () => {
    const el = ref.current;
    if (!el) return;
    if (requiresAuth && !blobUrl) {
      try {
        const token = useSession.getState().accessToken;
        const res = await fetch(mediaUrl(src), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error();
        const url = URL.createObjectURL(await res.blob());
        setBlobUrl(url);
        el.src = url;
      } catch {
        setFailed(true);
        return;
      }
    }
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  };

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <audio ref={ref} src={requiresAuth ? blobUrl ?? undefined : mediaUrl(src)} preload="none" />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? `إيقاف ${title}` : `تشغيل ${title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: "scaleX(-1)" }}><path d="M7 5v14l11-7z" /></svg>
        )}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        value={Math.floor(time)}
        onChange={(e) => {
          if (ref.current) ref.current.currentTime = Number(e.target.value);
        }}
        aria-label="موضع التشغيل"
        className="h-1.5 flex-1 accent-[var(--primary)]"
      />
      <span className="num w-20 shrink-0 text-xs text-muted" dir="ltr">
        {formatDuration(time)} / {formatDuration(duration)}
      </span>
      {failed && <span className="text-xs text-warning">تعذّر التشغيل</span>}
    </div>
  );
}
