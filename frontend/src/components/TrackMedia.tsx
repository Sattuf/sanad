import { useState } from "react";
import type { AudioTrack } from "../api/types";
import { AudioPlayer } from "./AudioPlayer";

/** المشغّل المناسب لنوع المقطع: ملف يخدمه سند نفسه، أو فيديو YouTube من قناة معتمدة. */
export function TrackMedia({ track, preview }: { track: AudioTrack; preview?: boolean }) {
  if (track.mediaKind === "YouTube" && track.youTubeVideoId) return <YouTubePlayer videoId={track.youTubeVideoId} title={track.title} />;
  if (!track.audioUrl) return null;
  return (
    <AudioPlayer
      src={preview ? `${track.audioUrl}?preview=true` : track.audioUrl}
      requiresAuth={preview}
      title={track.title}
      durationSeconds={track.durationSeconds}
    />
  );
}

/**
 * تضمين بنقرة: لا يُحمَّل أي شيء من YouTube (ولا يصل إليه عنوان المستخدم) قبل أن يضغط التشغيل بنفسه.
 * youtube-nocookie + rel=0 يمنعان ملفات التتبع الإعلانية واقتراح فيديوهات من قنوات أخرى.
 */
function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const [active, setActive] = useState(false);
  if (!active)
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label={`تشغيل ${title} من YouTube`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: "scaleX(-1)" }}><path d="M7 5v14l11-7z" /></svg>
        </button>
        <p className="text-xs text-muted">يُشغَّل من YouTube عند الضغط.</p>
      </div>
    );
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
        title={title}
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  );
}
