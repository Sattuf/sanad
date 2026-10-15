/** توحيد النص العربي للبحث والفحص — نظير ArabicTextNormalizer في الخادم (src/Sanad.Infrastructure/Safety). */
export function normalizeArabic(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[ً-ٰٟۖ-ۭـ‌-‏]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** يزيل «ال» التعريف وحروف العطف الملتصقة حتى تطابق «الخرزة» و«وخرزه» كلمة «خرزه». */
function stem(word: string) {
  let w = word;
  if (w.length > 3 && (w.startsWith("و") || w.startsWith("ب") || w.startsWith("ف"))) w = w.slice(1);
  if (w.length > 3 && w.startsWith("ال")) w = w.slice(2);
  return w;
}

/** درجة تطابق بسيطة: عبارة كاملة > كلمات مشتركة. 0 = لا تطابق. */
export function matchScore(query: string, haystacks: string[]): number {
  const q = normalizeArabic(query);
  if (!q) return 0;
  const qWords = q.split(" ").filter((w) => w.length > 1).map(stem);
  let best = 0;
  for (const h of haystacks) {
    const n = normalizeArabic(h);
    if (n.includes(q) || (q.length >= 4 && q.includes(n))) best = Math.max(best, 10);
    const hWords = new Set(n.split(" ").map(stem));
    const common = qWords.filter((w) => hWords.has(w) || [...hWords].some((hw) => hw.length >= 3 && (hw.startsWith(w) || w.startsWith(hw)))).length;
    if (common) best = Math.max(best, common * 3);
  }
  return best;
}
