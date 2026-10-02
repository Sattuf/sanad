/** مقارنة إصدارات بصيغة major.minor.patch — الأجزاء الناقصة أو غير الرقمية تُعدّ صفراً. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export const isBelowMinimum = (current: string, minimum: string) => compareVersions(current, minimum) < 0;
