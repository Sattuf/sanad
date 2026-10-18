/** تاريخ محلي بصيغة YYYY-MM-DD — اليوم يتبع ساعة المستخدم لا UTC. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function arNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

export function shortDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("ar", { weekday: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}
