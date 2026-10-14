import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx";
import { Button } from "../ui";

/*
  بطاقات مشاركة أنيقة (حالات واتساب/إنستغرام) تُرسم محلياً على Canvas — بلا خادم ولا تتبّع.
  كل بطاقة تحمل شعار سند ورابطه بهدوء: المستخدم يشارك محتوى يحبه، والتطبيق ينتشر معه (12 §12.4).
*/
export interface CardContent {
  kicker?: string;
  body: string;
  source?: string;
  /** نص قرآني → خط عثماني */
  quran?: boolean;
}

type Theme = "dawn" | "sky" | "night";
type Format = "square" | "story";

const THEMES: Record<Theme, { label: string; stops: [string, string, string]; ink: string; soft: string; accent: string }> = {
  dawn: { label: "فجر", stops: ["#e6f3f0", "#e3eef9", "#f9f0df"], ink: "#1e2b31", soft: "#5a6d74", accent: "#2a7a74" },
  sky: { label: "سماء", stops: ["#d7ebf7", "#e9f3f9", "#f4f8fb"], ink: "#18303f", soft: "#4f6b7c", accent: "#3d7fa8" },
  night: { label: "سَحَر", stops: ["#122233", "#16293b", "#1e2b2a"], ink: "#eef3f2", soft: "#a8bcc4", accent: "#f2cf86" },
};

const SIZES: Record<Format, [number, number]> = { square: [1080, 1080], story: [1080, 1920] };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function drawCard(canvas: HTMLCanvasElement, content: CardContent, theme: Theme, format: Format) {
  const [w, h] = SIZES[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const t = THEMES[theme];
  const bodyFont = content.quran ? "Amiri Quran" : "Amiri";
  await Promise.all([
    document.fonts.load(`64px "${bodyFont}"`),
    document.fonts.load('600 36px "IBM Plex Sans Arabic"'),
  ]).catch(() => undefined);

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, t.stops[0]);
  g.addColorStop(0.55, t.stops[1]);
  g.addColorStop(1, t.stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // هالات ضوء ناعمة
  for (const [x, y, r, a] of [[w * 0.85, h * 0.12, w * 0.45, 0.35], [w * 0.1, h * 0.92, w * 0.5, 0.25]] as const) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, theme === "night" ? `rgba(242,207,134,${a * 0.5})` : `rgba(255,255,255,${a + 0.3})`);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  const pad = 120;
  const maxW = w - pad * 2;

  // حجم الخط يتكيّف مع الطول
  let size = content.quran ? 64 : 60;
  let lines: string[] = [];
  const limit = h * (format === "story" ? 0.55 : 0.5);
  for (; size >= 34; size -= 2) {
    ctx.font = `${size}px "${bodyFont}"`;
    lines = wrap(ctx, content.body, maxW);
    if (lines.length * size * 1.9 <= limit) break;
  }
  const lh = size * 1.9;
  const blockH = lines.length * lh;
  let y = h / 2 - blockH / 2 + size * 0.6;

  if (content.kicker) {
    ctx.font = '600 34px "IBM Plex Sans Arabic"';
    ctx.fillStyle = t.accent;
    ctx.fillText(content.kicker, w / 2, y - size * 1.6);
  }

  ctx.font = `${size}px "${bodyFont}"`;
  ctx.fillStyle = t.ink;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += lh;
  }

  if (content.source) {
    ctx.font = '30px "IBM Plex Sans Arabic"';
    ctx.fillStyle = t.soft;
    ctx.fillText(content.source, w / 2, y + 10);
  }

  // التوقيع
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.arc(w / 2, h - 150, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = '600 34px "IBM Plex Sans Arabic"';
  ctx.fillStyle = t.ink;
  ctx.fillText("سند — رفيق السكينة اليومي", w / 2, h - 95);
  ctx.font = '26px "IBM Plex Sans Arabic"';
  ctx.fillStyle = t.soft;
  ctx.fillText(location.host, w / 2, h - 55);
}

export function ShareCardDialog({ content, onClose }: { content: CardContent; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [theme, setTheme] = useState<Theme>("dawn");
  const [format, setFormat] = useState<Format>("square");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (ref.current) void drawCard(ref.current, content, theme, format);
  }, [content, theme, format]);

  const share = async () => {
    const canvas = ref.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) return;
      const file = new File([blob], "sanad-card.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: "من سند — رفيق السكينة اليومي" }).catch(() => undefined);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sanad-card.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-3xl border border-border bg-surface p-0 text-text backdrop:bg-black/40"
      aria-label="تصميم بطاقة للمشاركة"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">بطاقة للمشاركة</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-2 py-1 text-muted hover:text-text" aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="flex justify-center rounded-2xl bg-surface-2 p-3">
          <canvas ref={ref} className={cx("h-auto rounded-xl shadow-md", format === "story" ? "max-h-[50vh] w-auto" : "w-full max-w-[360px]")} aria-label="معاينة البطاقة" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(THEMES) as Theme[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTheme(k)}
              aria-pressed={theme === k}
              className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", theme === k ? "border-primary text-primary" : "border-border text-muted")}
            >
              <span className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(135deg, ${THEMES[k].stops[0]}, ${THEMES[k].stops[2]})` }} />
              {THEMES[k].label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          {(["square", "story"] as Format[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
              className={cx("rounded-full border px-3 py-1.5 text-sm", format === f ? "border-primary text-primary" : "border-border text-muted")}
            >
              {f === "square" ? "منشور" : "حالة / ستوري"}
            </button>
          ))}
        </div>
        <Button onClick={() => void share()} busy={busy}>
          مشاركة أو حفظ الصورة
        </Button>
      </div>
    </dialog>
  );
}
