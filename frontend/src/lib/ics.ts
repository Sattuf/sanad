/**
 * تذكير يومي بلا خادم ولا إشعارات: ملف تقويم (.ics) بحدث يتكرر يومياً يضيفه المستخدم لتقويمه بنفسه.
 * عنوان الحدث محايد عمداً («وِرد اليوم») حتى لا يكشف شيئاً على شاشة القفل.
 */
export function dailyReminderIcs({ hour, minute, title, url }: { hour: number; minute: number; title: string; url: string }) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(hour)}${pad(minute)}00`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sanad//Daily Wird//AR",
    "BEGIN:VEVENT",
    `UID:sanad-wird-${hour}${minute}-${now.getTime()}@sanad`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    "DURATION:PT10M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${title}`,
    `DESCRIPTION:${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${title}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadText(filename: string, content: string, type = "text/calendar") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
