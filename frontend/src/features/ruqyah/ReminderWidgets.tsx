import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useMe } from "../../api/hooks";
import { Button, Input } from "../../components/ui";
import type { MyWird } from "./progress";
import {
  currentSubscription, disablePush, enablePush, getMyDevices, getPushConfig, pushSupport, PushPermissionDenied,
  sendTestPush, updatePush, type ReminderTimes,
} from "./push";
import { buildIcs, dueWird, slots } from "./reminders";

/*
  التذكير بالأذكار بطريقتين:
  - إشعارات الجوال (Web Push) للمستخدم المسجّل: يرسلها الخادم في الوقت المختار بتوقيته، والتطبيق مغلق.
  - ملف تقويم (ICS) بتكرار يومي لمن لا يريد الإشعارات أو لا يدعمها جهازه — بلا حساب ولا أذونات.
  وتذكير لطيف داخل الصفحة إن حان وقت ورد لم يُتمّ اليوم.
*/

type Times = Record<string, string>;
type Enabled = Record<string, boolean>;

const defaultTimes = (): Times => Object.fromEntries(slots.map((s) => [s.id, s.defaultTime]));

function toReminderTimes(times: Times, enabled: Enabled): ReminderTimes {
  const pick = (id: string) => (enabled[id] ? times[id] : null);
  return { morning: pick("morning"), evening: pick("evening"), sleep: pick("sleep") };
}

export function ReminderCard() {
  const [times, setTimes] = useState<Times>(defaultTimes);
  const [enabled, setEnabled] = useState<Enabled>({ morning: true, evening: true, sleep: true });
  const [done, setDone] = useState(false);
  const anyEnabled = Object.values(enabled).some(Boolean);

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
      <p className="mt-1 text-muted">اختر الأوقات، ثم فعّل إشعارات الجوال أو أضفها إلى تقويمك؛ يصلك التنبيه يومياً ويفتح الورد مباشرة.</p>
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

      <PushReminders times={times} enabled={enabled} onLoaded={(t, e) => { setTimes(t); setEnabled(e); }} />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={download} disabled={!anyEnabled}>أضف إلى التقويم بدلاً من ذلك</Button>
        {done && <p className="text-sm text-success" role="status">نُزّل الملف — افتحه ووافق على إضافة المواعيد.</p>}
      </div>
      <InstallApp />
    </section>
  );
}

type PushState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "needs-install" }
  | { kind: "signed-out" }
  | { kind: "off" }
  | { kind: "on"; sub: PushSubscription; saved: ReminderTimes };

const sameTimes = (a: ReminderTimes, b: ReminderTimes) => a.morning === b.morning && a.evening === b.evening && a.sleep === b.sleep;

function PushReminders({ times, enabled, onLoaded }: { times: Times; enabled: Enabled; onLoaded: (t: Times, e: Enabled) => void }) {
  const { data: me, isLoading: meLoading } = useMe();
  const config = useQuery({ queryKey: ["push-config"], queryFn: getPushConfig, staleTime: Infinity, retry: false });
  const [state, setState] = useState<PushState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const current = toReminderTimes(times, enabled);

  useEffect(() => {
    let cancelled = false;
    const support = pushSupport();
    if (support === "needs-install") return setState({ kind: "needs-install" });
    if (support === "unsupported" || config.isError || (config.data && !config.data.enabled)) return setState({ kind: "unavailable" });
    if (meLoading || !config.data) return;
    if (!me) return setState({ kind: "signed-out" });
    void (async () => {
      const sub = await currentSubscription().catch(() => null);
      const devices = sub ? await getMyDevices().catch(() => []) : [];
      const mine = sub && devices.find((d) => d.endpoint === sub.endpoint);
      if (cancelled) return;
      if (!sub || !mine) return setState({ kind: "off" });
      const saved = { morning: mine.morning, evening: mine.evening, sleep: mine.sleep };
      onLoaded(
        { morning: mine.morning ?? times.morning, evening: mine.evening ?? times.evening, sleep: mine.sleep ?? times.sleep },
        { morning: mine.morning !== null, evening: mine.evening !== null, sleep: mine.sleep !== null },
      );
      setState({ kind: "on", sub, saved });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- التحميل الأول فقط؛ onLoaded وtimes لا يعيدان الفحص
  }, [me, meLoading, config.data, config.isError]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({
        tone: "warn",
        text: e instanceof PushPermissionDenied
          ? "لم يُسمح بالإشعارات. فعّلها لسند من إعدادات المتصفح أو الجوال ثم حاول مجدداً."
          : e instanceof ApiError ? e.friendly : "تعذّر تفعيل الإشعارات على هذا الجهاز الآن.",
      });
    } finally {
      setBusy(false);
    }
  };

  const enable = () => run(async () => {
    const { sub } = await enablePush(config.data!.publicKey!, current);
    setState({ kind: "on", sub, saved: current });
    setMessage({ tone: "ok", text: "فُعّلت الإشعارات — ستصلك أذكارك في أوقاتها بإذن الله." });
  });

  const save = (sub: PushSubscription) => run(async () => {
    await updatePush(sub, current);
    setState({ kind: "on", sub, saved: current });
    setMessage({ tone: "ok", text: "حُفظت الأوقات." });
  });

  const test = (sub: PushSubscription) => run(async () => {
    try {
      await sendTestPush(sub);
      setMessage({ tone: "ok", text: "أُرسل إشعار تجريبي — يصلك خلال لحظات." });
    } catch (e) {
      // خدمة الدفع أبلغت أن تسجيل هذا المتصفح انتهى (فحذفه الخادم) — نعيد الحالة ليُفعَّل من جديد
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      await sub.unsubscribe().catch(() => undefined);
      setState({ kind: "off" });
      setMessage({ tone: "warn", text: "انتهى تسجيل الإشعارات على هذا الجهاز — فعّلها من جديد." });
    }
  });

  const stop = (sub: PushSubscription) => run(async () => {
    await disablePush(sub);
    setState({ kind: "off" });
    setMessage({ tone: "ok", text: "أُوقفت الإشعارات على هذا الجهاز." });
  });

  if (state.kind === "loading" || state.kind === "unavailable") return null;

  return (
    <div className="mt-4 rounded-2xl border border-lamp/30 bg-surface-2/40 p-4">
      <h3 className="font-bold">إشعارات الجوال</h3>
      {state.kind === "needs-install" && (
        <p className="mt-1 text-sm text-muted">
          على iPhone تصل الإشعارات لتطبيق سند المثبّت: اضغط زر المشاركة <span aria-hidden>⎋</span> في سفاري ثم «إضافة إلى الشاشة الرئيسية»،
          وافتح سند من أيقونته ثم فعّل الإشعارات من هنا.
        </p>
      )}
      {state.kind === "signed-out" && (
        <p className="mt-1 text-sm text-muted">
          <Link to="/login" className="font-semibold text-primary">سجّل الدخول</Link> لتصلك أذكارك إشعاراً على جوالك في أوقاتها، حتى والتطبيق مغلق.
        </p>
      )}
      {state.kind === "off" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="basis-full text-sm text-muted sm:basis-auto sm:flex-1">يصلك تنبيه في كل وقت اخترته بتوقيت جهازك، ويفتح الورد بنقرة.</p>
          <Button onClick={enable} busy={busy} disabled={!anyChosen(current)}>فعّل الإشعارات</Button>
        </div>
      )}
      {state.kind === "on" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="basis-full text-sm font-semibold text-success sm:basis-auto sm:flex-1">الإشعارات مفعّلة على هذا الجهاز.</p>
          {!sameTimes(current, state.saved) && (
            <Button onClick={() => save(state.sub)} busy={busy} disabled={!anyChosen(current)}>احفظ الأوقات</Button>
          )}
          <Button variant="secondary" onClick={() => test(state.sub)} disabled={busy}>إشعار تجريبي</Button>
          <Button variant="ghost" onClick={() => stop(state.sub)} disabled={busy}>إيقاف</Button>
        </div>
      )}
      {message && (
        <p className={`mt-2 text-sm ${message.tone === "ok" ? "text-success" : "text-lamp"}`} role="status">{message.text}</p>
      )}
    </div>
  );
}

const anyChosen = (t: ReminderTimes) => Boolean(t.morning || t.evening || t.sleep);

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** زر «ثبّت سند» حين يعرض المتصفح التثبيت (أندرويد وكروم وإيدج). */
function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="mt-3 text-sm text-success" role="status">ثُبّت سند — تجده في شاشة جوالك الرئيسية.</p>;
  if (!prompt) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm text-muted">ثبّت سند على جوالك: يفتح كتطبيق، وتعمل الأذكار دون اتصال.</p>
      <Button variant="secondary" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>ثبّت التطبيق</Button>
    </div>
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
