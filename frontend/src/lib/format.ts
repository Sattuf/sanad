const dateFmt = new Intl.DateTimeFormat("ar", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });
const timeFmt = new Intl.DateTimeFormat("ar", { timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** تحويل قيمة datetime-local (توقيت المستخدم) إلى ISO UTC. */
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}
