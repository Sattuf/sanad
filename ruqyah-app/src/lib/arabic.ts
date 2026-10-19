// أرقام عربية مشرقية وصيغ العدد في كل الواجهة (design-system.md §8)

export const ar = (n: number) => n.toLocaleString("ar-EG");

/** صيغة المعدود: واحد، مثنى، جمع (٣–١٠)، مفرد منصوب (١١+). */
function counted(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  const m = n % 100;
  return `${ar(n)} ${m >= 3 && m <= 10 ? few : many}`;
}

export const days = (n: number) => counted(n, "يوم واحد", "يومان", "أيام", "يوماً");
export const ajza = (n: number) => counted(n, "جزء واحد", "جزءان", "أجزاء", "جزءاً");
export const minutes = (n: number) => counted(n, "دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة");

const hijriFmt = (opts: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", opts);
  } catch {
    return null;
  }
};
const hijriLong = hijriFmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hijriShort = hijriFmt({ day: "numeric", month: "long", year: "numeric" });
const gregorian = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" });

/** التاريخ الهجري (أم القرى) أولاً، والميلادي بعده. */
export function hijri(d = new Date(), withWeekday = true) {
  const f = withWeekday ? hijriLong : hijriShort;
  try {
    return f ? f.format(d) : gregorian.format(d);
  } catch {
    return gregorian.format(d);
  }
}
