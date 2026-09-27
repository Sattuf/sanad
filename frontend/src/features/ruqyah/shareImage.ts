import type { SceneTheme } from "./content";

/*
  بطاقة مشاركة للآية أو الدعاء (1080×1350، مقاس منشورات الجوال): تُرسم في المتصفح على Canvas
  بخط المصحف الحقيقي فوق خلفية المشهد — لا يُرسل النص لأي خدمة، ولا يولّد الذكاء الاصطناعي أي حرف فيها.
*/

const W = 1080;
const H = 1350;

const palettes: Record<SceneTheme, [string, string]> = {
  lantern: ["#0b2e33", "#05121a"],
  dawn: ["#c98f5a", "#1c3a40"],
  dusk: ["#1c2452", "#0a2a33"],
  night: ["#0a1030", "#04060f"],
  mihrab: ["#2c4f4a", "#0a1a19"],
  manuscript: ["#203c3a", "#061211"],
};

export interface ShareCard { theme: SceneTheme; text: string; quran: boolean; title: string; source: string }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** تقسيم النص إلى أسطر بعرض أقصى — القياس بالكلمات يحفظ اتصال الحروف العربية. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  // المسافة العادية فقط تفصل الكلمات؛ المسافة غير الفاصلة تُبقي رقم الآية مع آخر كلمة منها
  for (const word of text.split(/ +/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export async function renderShareCard(card: ShareCard): Promise<Blob> {
  const fontFamily = card.quran ? "Amiri Quran" : "Amiri";
  await Promise.all([document.fonts.load(`64px "${fontFamily}"`), document.fonts.load('700 40px "Amiri"')]).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // الخلفية: صورة المشهد إن وُجدت، ثم تدرّج يضمن وضوح النص
  const [top, bottom] = palettes[card.theme];
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, top);
  base.addColorStop(1, bottom);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(`/library/${card.theme}.jpg`);
  if (img) {
    const scale = Math.max(W / img.width, H / img.height);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.globalAlpha = 1;
  }
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, "rgba(4,12,16,.55)");
  veil.addColorStop(0.5, "rgba(4,12,16,.72)");
  veil.addColorStop(1, "rgba(4,12,16,.9)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  // إطار ذهبي مزدوج ونجمة علوية
  ctx.strokeStyle = "rgba(242,198,117,.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.strokeStyle = "rgba(242,198,117,.25)";
  ctx.strokeRect(62, 62, W - 124, H - 124);
  ctx.fillStyle = "#f2c675";
  star(ctx, W / 2, 150, 22);
  ctx.fill();

  ctx.direction = "rtl";
  ctx.textAlign = "center";

  ctx.fillStyle = "#f2c675";
  ctx.font = '700 40px "Amiri", serif';
  ctx.fillText(card.title, W / 2, 235);

  // النص: يُصغَّر الخط حتى يتسع في المساحة المتاحة
  const body = card.quran ? card.text : `«${card.text}»`;
  const areaTop = 300;
  const areaBottom = H - 260;
  let size = card.quran ? 64 : 56;
  let lines: string[] = [];
  let lineHeight = 0;
  for (; size >= 26; size -= 2) {
    ctx.font = `${size}px "${fontFamily}", serif`;
    lineHeight = size * (card.quran ? 2.05 : 1.85);
    lines = wrap(ctx, body, W - 220);
    if (lines.length * lineHeight <= areaBottom - areaTop) break;
  }
  ctx.fillStyle = "#fbf6ea";
  const startY = areaTop + (areaBottom - areaTop - lines.length * lineHeight) / 2 + lineHeight * 0.7;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineHeight));

  ctx.fillStyle = "rgba(236,233,226,.8)";
  ctx.font = '32px "Amiri", serif';
  ctx.fillText(card.source, W / 2, H - 200);

  ctx.fillStyle = "rgba(242,198,117,.85)";
  ctx.font = '700 30px "Amiri", serif';
  ctx.fillText("سند · الرقية والتحصين", W / 2, H - 110);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

/** مشاركة عبر قائمة الجهاز إن دعمت الملفات، وإلا تنزيل الصورة. */
export async function shareOrDownload(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      /* ألغى المستخدم المشاركة — ننزّل بدلاً منها */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
