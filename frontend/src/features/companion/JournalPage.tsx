import { useEffect, useMemo, useState } from "react";
import { ProgressRing } from "../../components/companion";
import { Button, Card, Field, Input, PageHeader, Textarea } from "../../components/ui";
import { addDays, arNum, localDay, shortDayLabel } from "../../lib/dates";
import { downloadText } from "../../lib/ics";
import { cx } from "../../lib/cx";
import { JOURNAL_METRICS, STABLE_DELTA, TREND_DAYS, TREND_MIN_ENTRIES, journalTrends, sessionsDelta } from "@sanad/shared/content/companion/journal";
import { vault, WrongPinError } from "../../lib/vault";
import { useCompanion } from "../../stores/companion";
import { useJournal, type CheckIn, type JournalData, type Scale } from "../../stores/journal";

/*
  «مذكّرتي» — متابعة الحالة اليومية بخصوصية تامة: مشفّرة على الجهاز، لا تصل لأي خادم.
  نعرض الاتجاه والارتباط بأيام الالتزام بلغة محايدة؛ لا نقول «تحسّنت بسبب الرقية» ولا نشخّص.
*/

const METRICS = JOURNAL_METRICS;

export function JournalPage() {
  const unlocked = useJournal((s) => s.unlocked);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="مذكّرتي"
        subtitle="دقيقة كل يوم تسجّل فيها حالتك. بعد أسبوعين ترى بعينك كيف تتغيّر أيامك مع التزامك. مشفّرة على جهازك فقط — لا نراها نحن ولا أحد غيرك."
        actions={unlocked ? <Button variant="secondary" onClick={() => useJournal.getState().lock()}>🔒 قفل</Button> : undefined}
      />
      {unlocked ? <JournalBody /> : <LockScreen />}
    </div>
  );
}

function LockScreen() {
  const { create, unlockPin, unlockBio } = useJournal();
  const exists = vault.exists();
  const hasBio = vault.hasBiometric();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof WrongPinError ? "الرمز غير صحيح." : e instanceof Error ? e.message : "تعذّر الفتح.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (hasBio) void run(unlockBio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="mx-auto max-w-md text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky text-2xl" aria-hidden>🔐</div>
      <h2 className="mt-4 text-xl font-bold">{exists ? "افتح مذكّرتك" : "أنشئ مذكّرتك الخاصة"}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">
        {exists
          ? "أدخل رمزك، أو استخدم بصمتك إن فعّلتها."
          : "اختر رمزاً من ٤ أرقام أو أكثر. تُشفَّر المذكّرة به على جهازك. لا يمكن استرجاعها إن نسيته — هذا ثمن ألا يملك مفتاحها أحد غيرك."}
      </p>
      <form
        className="mt-5 flex flex-col gap-3 text-start"
        onSubmit={(e) => {
          e.preventDefault();
          if (!exists) {
            if (pin.length < 4) return setError("الرمز ٤ خانات على الأقل.");
            if (pin !== confirm) return setError("الرمزان غير متطابقين.");
            void run(() => create(pin));
          } else void run(() => unlockPin(pin));
        }}
      >
        <Field label="الرمز" htmlFor="pin">
          <Input id="pin" type="password" inputMode="numeric" autoComplete={exists ? "current-password" : "new-password"} value={pin} onChange={(e) => setPin(e.target.value)} dir="ltr" className="text-center tracking-[0.5em]" />
        </Field>
        {!exists && (
          <Field label="أعد كتابة الرمز" htmlFor="pin2">
            <Input id="pin2" type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" className="text-center tracking-[0.5em]" />
          </Field>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <Button type="submit" busy={busy}>{exists ? "فتح" : "إنشاء المذكّرة"}</Button>
        {exists && hasBio && (
          <Button type="button" variant="secondary" onClick={() => void run(unlockBio)}>
            فتح بالبصمة / الوجه
          </Button>
        )}
      </form>
    </Card>
  );
}

function JournalBody() {
  const data = useJournal((s) => s.data)!;
  const [day, setDay] = useState(localDay());
  return (
    <div className="flex flex-col gap-6">
      <CheckInForm key={day} day={day} existing={data.checkIns[day]} onPickDay={setDay} />
      <Trends data={data} />
      <Sessions data={data} />
      <JournalSettings data={data} />
    </div>
  );
}

function ScalePicker({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: Scale; onChange: (v: Scale) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 flex gap-1.5">
        {([0, 1, 2, 3, 4] as Scale[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            aria-label={`${label}: ${arNum(v + 1)} من ٥`}
            onClick={() => onChange(v)}
            className={cx(
              "num h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors",
              value === v ? "border-primary bg-primary text-primary-contrast" : "border-border bg-surface hover:border-primary",
            )}
            style={value !== v ? { background: `color-mix(in srgb, var(--primary) ${v * 6}%, var(--surface))` } : undefined}
          >
            {arNum(v + 1)}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

function CheckInForm({ day, existing, onPickDay }: { day: string; existing?: CheckIn; onPickDay: (d: string) => void }) {
  const saveCheckIn = useJournal((s) => s.saveCheckIn);
  const [v, setV] = useState({ calm: existing?.calm ?? 2, sleep: existing?.sleep ?? 2, energy: existing?.energy ?? 2, mood: existing?.mood ?? 2 } as Record<(typeof METRICS)[number]["key"], Scale>);
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);
  const today = localDay();

  const submit = async () => {
    await saveCheckIn({ day, ...v, note: note.trim() || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{day === today ? "كيف حالك اليوم؟" : `حالتك يوم ${shortDayLabel(day)}`}</h2>
        <div className="flex gap-1 text-sm">
          <button type="button" className="rounded-lg px-2 py-1 text-muted hover:text-text" onClick={() => onPickDay(addDays(day, -1))} aria-label="اليوم السابق">→</button>
          {day !== today && <button type="button" className="rounded-lg px-2 py-1 font-semibold text-primary" onClick={() => onPickDay(today)}>اليوم</button>}
          {day < today && <button type="button" className="rounded-lg px-2 py-1 text-muted hover:text-text" onClick={() => onPickDay(addDays(day, 1))} aria-label="اليوم التالي">←</button>}
        </div>
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {METRICS.map((m) => (
          <ScalePicker key={m.key} label={m.label} low={m.low} high={m.high} value={v[m.key]} onChange={(x) => setV((s) => ({ ...s, [m.key]: x }))} />
        ))}
      </div>
      <div className="mt-5">
        <Field label="ملاحظة لنفسك (اختياري)" htmlFor="note" hint="لا يقرؤها أحد غيرك.">
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="ما الذي أثقلك أو أسعدك اليوم؟" />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void submit()}>{existing ? "تحديث" : "حفظ"}</Button>
        {saved && <span className="text-sm font-semibold text-success" role="status">حُفظ مشفّراً ✓</span>}
      </div>
    </Card>
  );
}

function Trends({ data }: { data: JournalData }) {
  const activeDays = useCompanion((s) => s.activeDays);
  const today = localDay();
  const tr = useMemo(() => journalTrends(data.checkIns, activeDays, today), [data.checkIns, activeDays, today]);
  const { days, count } = tr;
  const entries = days.map((d) => data.checkIns[d]);

  if (count < TREND_MIN_ENTRIES) {
    return (
      <Card className="text-center">
        <ProgressRing value={count / TREND_DAYS} size={72} stroke={7}>
          <span className="num">{arNum(count)}/١٤</span>
        </ProgressRing>
        <p className="mt-3 font-bold">رسمك البياني يتشكّل</p>
        <p className="mt-1 text-sm text-muted">سجّل ٣ أيام على الأقل لترى الاتجاه، و١٤ يوماً لترى الصورة كاملة.</p>
      </Card>
    );
  }

  const committed = (d: string) => Boolean(activeDays[d]);

  return (
    <Card>
      <h2 className="text-lg font-bold">آخر ١٤ يوماً</h2>
      <p className="mt-1 text-sm text-muted">
        <span className="me-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "color-mix(in srgb, var(--lamp-glow) 40%, transparent)" }} aria-hidden />
        الأعمدة المظلّلة أيام أنجزت فيها شيئاً من برنامجك.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <MiniChart key={m.key} title={m.label} days={days} values={entries.map((e) => (e ? e[m.key] : null))} highlight={days.map(committed)} />
        ))}
      </div>

      <div className="mt-5 grid gap-2 text-sm">
        {tr.calm && <Insight label="الهدوء" now={tr.calm.now} before={tr.calm.before} />}
        {tr.sleep && <Insight label="النوم" now={tr.sleep.now} before={tr.sleep.before} />}
        {tr.committedCalm && (
          <p className="rounded-xl bg-surface-2 px-4 py-2 leading-7">
            في أيام التزامك كان متوسط هدوئك <strong className="num">{arNum((tr.committedCalm.committed + 1).toFixed(1))}</strong> من ٥، مقابل{" "}
            <strong className="num">{arNum((tr.committedCalm.other + 1).toFixed(1))}</strong> في غيرها.
          </p>
        )}
        <p className="text-xs text-muted">هذه ملاحظات عن أيامك أنت — والتزامن بين أمرين لا يعني بالضرورة أن أحدهما سبب الآخر.</p>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-primary">عرض كجدول</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-center">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-start font-semibold">اليوم</th>
                {METRICS.map((m) => <th key={m.key} className="font-semibold">{m.label}</th>)}
                <th className="font-semibold">التزام</th>
              </tr>
            </thead>
            <tbody className="num">
              {days.map((d) => {
                const e = data.checkIns[d];
                return (
                  <tr key={d} className="border-t border-border">
                    <td className="py-1 text-start">{shortDayLabel(d)}</td>
                    {METRICS.map((m) => <td key={m.key}>{e ? arNum(e[m.key] + 1) : "—"}</td>)}
                    <td>{committed(d) ? "✓" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function Insight({ label, now, before }: { label: string; now: number; before: number }) {
  const diff = now - before;
  if (Math.abs(diff) < STABLE_DELTA) return <p className="rounded-xl bg-surface-2 px-4 py-2">{label}: مستقر خلال الأسبوعين.</p>;
  return (
    <p className="rounded-xl bg-surface-2 px-4 py-2">
      {label} في الأسبوع الأخير {diff > 0 ? "أعلى" : "أقل"} من الأسبوع الذي قبله ({arNum((before + 1).toFixed(1))} ← {arNum((now + 1).toFixed(1))} من ٥).
      {diff < 0 && " لا بأس — الأيام تتقلّب، والمهم الاستمرار."}
    </p>
  );
}

/** مخطط خطي صغير لمقياس واحد (small multiples: لون واحد، بلا محورين). */
function MiniChart({ title, days, values, highlight }: { title: string; days: string[]; values: Array<number | null>; highlight: boolean[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 120;
  const pad = { t: 10, b: 6, x: 8 };
  const step = (W - pad.x * 2) / (days.length - 1);
  // RTL: الأحدث يساراً
  const x = (i: number) => W - pad.x - i * step;
  const y = (v: number) => pad.t + (1 - v / 4) * (H - pad.t - pad.b);
  const segments: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  return (
    <figure className="rounded-2xl border border-border p-3">
      <figcaption className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>{title}</span>
        {hover !== null && (
          <span className="num text-xs font-normal text-muted">
            {shortDayLabel(days[hover])}: {values[hover] === null ? "لم يُسجَّل" : `${arNum((values[hover] as number) + 1)} من ٥`}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title} خلال ١٤ يوماً`} onMouseLeave={() => setHover(null)}>
        {[0, 2, 4].map((v) => (
          <line key={v} x1={pad.x} x2={W - pad.x} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
        ))}
        {highlight.map((h, i) =>
          h ? <rect key={i} x={x(i) - step / 2 + 1} y={pad.t} width={step - 2} height={H - pad.t - pad.b} rx="4" fill="color-mix(in srgb, var(--lamp-glow) 30%, transparent)" /> : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />}
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {values.map((v, i) =>
          v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />,
        )}
        {days.map((_, i) => (
          <rect key={`h${i}`} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted" aria-hidden>
        <span>قبل أسبوعين</span>
        <span>اليوم</span>
      </div>
    </figure>
  );
}

function Sessions({ data }: { data: JournalData }) {
  if (!data.sessions.length) return null;
  const last = data.sessions.slice(-10);
  const delta = sessionsDelta(data.sessions);
  return (
    <Card>
      <h2 className="text-lg font-bold">جلساتك</h2>
      <p className="mt-1 text-sm text-muted">
        سجّلت <span className="num">{arNum(data.sessions.length)}</span> جلسة رقية أو سكينة.
        {Number.isFinite(delta) && delta > 0 && (
          <> في المتوسط شعرت بهدوء أكبر بعدها بـ <strong className="num">{arNum(delta.toFixed(1))}</strong> درجة (من ١٠).</>
        )}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {last.map((s) => (
          <li key={s.at} className="num rounded-full bg-surface-2 px-3 py-1">
            {s.kind === "ruqyah" ? "رقية" : "سكينة"}: {arNum(s.before)} ← {arNum(s.after)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function JournalSettings({ data }: { data: JournalData }) {
  const unlocked = useJournal((s) => s.unlocked)!;
  const wipe = useJournal((s) => s.wipe);
  const [bioSupported, setBioSupported] = useState(false);
  const [hasBio, setHasBio] = useState(vault.hasBiometric());
  const [msg, setMsg] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    void vault.biometricAvailable().then(setBioSupported);
  }, []);

  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-lg font-bold">الخصوصية والقفل</summary>
        <div className="mt-4 flex flex-col gap-5 text-sm">
          {msg && <p role="status" className="rounded-xl bg-surface-2 px-4 py-2">{msg}</p>}
          <section>
            <h3 className="font-semibold">البصمة / بصمة الوجه</h3>
            <p className="mt-1 text-muted">تفتح المذكّرة بمفتاح جهازك نفسه — البصمة لا تغادر جهازك ولا نراها.</p>
            {!bioSupported ? (
              <p className="mt-2 text-muted">غير متاحة في هذا المتصفح أو الجهاز.</p>
            ) : hasBio ? (
              <Button variant="secondary" className="mt-2" onClick={() => { vault.disableBiometric(); setHasBio(false); setMsg("أُلغي الفتح بالبصمة."); }}>إلغاء البصمة</Button>
            ) : (
              <Button
                variant="secondary"
                className="mt-2"
                onClick={async () => {
                  try {
                    await vault.enableBiometric(unlocked);
                    setHasBio(true);
                    setMsg("فُعّل الفتح بالبصمة ✓");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "تعذّر التفعيل.");
                  }
                }}
              >
                فعّل الفتح بالبصمة
              </Button>
            )}
          </section>
          <section>
            <h3 className="font-semibold">تغيير الرمز</h3>
            <div className="mt-2 flex gap-2">
              <label htmlFor="newpin" className="sr-only">الرمز الجديد</label>
              <Input id="newpin" type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value)} dir="ltr" className="max-w-40" />
              <Button
                variant="secondary"
                disabled={newPin.length < 4}
                onClick={async () => {
                  await vault.changePin(unlocked, newPin);
                  setNewPin("");
                  setMsg("تغيّر الرمز ✓");
                }}
              >
                تغيير
              </Button>
            </div>
          </section>
          <section>
            <h3 className="font-semibold">بياناتك ملكك</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadText(`sanad-journal-${localDay()}.json`, JSON.stringify(data, null, 2), "application/json")}>
                تنزيل نسخة (غير مشفّرة)
              </Button>
              {!confirmWipe ? (
                <Button variant="ghost" className="text-danger" onClick={() => setConfirmWipe(true)}>حذف المذكّرة نهائياً</Button>
              ) : (
                <Button variant="danger" onClick={wipe}>تأكيد الحذف — لا يمكن التراجع</Button>
              )}
            </div>
          </section>
        </div>
      </details>
    </Card>
  );
}
