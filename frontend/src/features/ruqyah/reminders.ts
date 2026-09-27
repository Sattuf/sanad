import { isCompletedToday, type MyWird } from "./progress";

/* منطق التذكير (بلا واجهة) — ملف تقويم ICS يومي، ومعرفة الورد الذي حان وقته. */

export interface Slot { id: string; label: string; collection: string; defaultTime: string }

export const slots: Slot[] = [
  { id: "morning", label: "أذكار الصباح", collection: "morning-evening", defaultTime: "06:30" },
  { id: "evening", label: "أذكار المساء", collection: "morning-evening", defaultTime: "17:30" },
  { id: "sleep", label: "أذكار النوم", collection: "sleep", defaultTime: "22:30" },
];

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

export function buildIcs(times: Record<string, string>, origin: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = slots.filter((s) => times[s.id]).map((s) => {
    const [h, m] = times[s.id].split(":");
    const url = `${origin}/ruqyah/${s.collection}`;
    return [
      "BEGIN:VEVENT",
      `UID:sanad-${s.id}@sanad`,
      `DTSTAMP:${stamp}`,
      // وقت محلي عائم: يبقى في الساعة نفسها أينما كان المستخدم
      `DTSTART:${date}T${h}${m}00`,
      "DURATION:PT10M",
      "RRULE:FREQ=DAILY",
      `SUMMARY:${icsEscape(s.label)} — سند`,
      `DESCRIPTION:${icsEscape(`حان وقت ${s.label}. ${url}`)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(s.label)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sanad//Ruqyah Reminders//AR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

/** الورد الذي حان وقته الآن ولم يُتمّ اليوم — أو null. */
export function dueWird(hour: number, wird?: MyWird): { collection: string; label: string } | null {
  const slot = hour >= 4 && hour < 11 ? slots[0] : hour >= 15 && hour < 20 ? slots[1] : hour >= 21 || hour < 2 ? slots[2] : null;
  if (!slot || isCompletedToday(slot.collection, wird)) return null;
  return { collection: slot.collection, label: slot.label };
}

