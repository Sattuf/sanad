import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "../../components/ui";
import type { MyWird } from "./progress";
import { buildIcs, dueWird, slots } from "./reminders";

/*
  التذكير بالأذكار بلا إشعارات خادم ولا أذونات: ملف تقويم (ICS) بتكرار يومي يضيفه المستخدم لتقويم جواله،
  فيصله التنبيه في وقته حتى والموقع مغلق. وتذكير لطيف داخل الصفحة إن حان وقت ورد لم يُتمّ اليوم.
*/

export function ReminderCard() {
  const [times, setTimes] = useState<Record<string, string>>(() => Object.fromEntries(slots.map((s) => [s.id, s.defaultTime])));
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ morning: true, evening: true, sleep: true });
  const [done, setDone] = useState(false);

  const download = () => {
    const chosen = Object.fromEntries(slots.filter((s) => enabled[s.id]).map((s) => [s.id, times[s.id]]));
    const blob = new Blob([buildIcs(chosen, window.location.origin)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sanad-adhkar.ics";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setDone(true);
  };

  return (
    <section className="rounded-3xl border border-border bg-surface p-6" aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="text-xl font-bold">ذكّرني بأذكاري</h2>
      <p className="mt-1 text-muted">اختر الأوقات ثم أضفها إلى تقويم جوالك مرة واحدة؛ يصلك التنبيه يومياً ويفتح الورد مباشرة.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <input
              id={`rem-${s.id}`}
              type="checkbox"
              checked={enabled[s.id]}
              onChange={(e) => setEnabled((x) => ({ ...x, [s.id]: e.target.checked }))}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <label htmlFor={`rem-${s.id}`} className="flex-1 text-sm font-semibold">{s.label}</label>
            <Input
              type="time"
              aria-label={`وقت ${s.label}`}
              value={times[s.id]}
              onChange={(e) => setTimes((x) => ({ ...x, [s.id]: e.target.value }))}
              className="num w-28 py-1.5 text-sm"
              disabled={!enabled[s.id]}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={download} disabled={!Object.values(enabled).some(Boolean)}>أضف إلى التقويم</Button>
        {done && <p className="text-sm text-success" role="status">نُزّل الملف — افتحه ووافق على إضافة المواعيد.</p>}
      </div>
    </section>
  );
}

export function DueWirdNudge({ wird }: { wird?: MyWird }) {
  const due = useMemo(() => dueWird(new Date().getHours(), wird), [wird]);
  const [hidden, setHidden] = useState(false);
  return (
    <AnimatePresence>
      {due && !hidden && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lamp/40 bg-surface px-5 py-3"
          role="status"
        >
          <p className="font-semibold">حان وقت {due.label} — لم تُتمّها اليوم بعد.</p>
          <div className="flex gap-2">
            <Link to={`/ruqyah/${due.collection}`} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">ابدأ الآن</Link>
            <button type="button" onClick={() => setHidden(true)} className="rounded-xl px-3 py-2 text-sm text-muted hover:text-text">لاحقاً</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
