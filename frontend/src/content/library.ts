import { mediaUrl } from "../api/client";
import { ayahAudioPath } from "../features/ruqyah/recitation";
import type { Ayah } from "@sanad/shared/content/companion/library";

// المحتوى نفسه في @sanad/shared (مشترك مع تطبيق Flutter — ADR-0023)؛ هنا ما يخص الويب فقط.
export * from "@sanad/shared/content/companion/library";

/** تلاوة الآية عبر خادم سند (يجلبها من everyayah مرة واحدة) — نفس مسار القارئ في /ruqyah. */
export function ayahAudioUrl(a: Pick<Ayah, "surah" | "ayah">) {
  return mediaUrl(ayahAudioPath("Alafasy_128kbps", a.surah, a.ayah));
}
