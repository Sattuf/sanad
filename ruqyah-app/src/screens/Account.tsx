import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@sanad/shared/api/core";
import { authApi } from "@sanad/shared/api/auth";
import { api, hasApi, WEB_URL } from "../api/client";
import { Btn, Hashiya, Jadwal, Sarlawh } from "../components/ornaments";
import { reminderLabels, type Reminder } from "../domain/enrollment";
import { currentPush, defaultTimes, disablePush, enablePush, pushSupported, testPush } from "../lib/push";
import { register, signIn, signOut, SignInNeedsWebError, useAccount } from "../state/account";
import { actions, useStore } from "../state/store";
import { navigate } from "../lib/router";
import { load } from "../lib/storage";

const message = (e: unknown) =>
  e instanceof ApiError ? e.friendly : e instanceof SignInNeedsWebError || e instanceof Error ? e.message : "حدث خطأ غير متوقع.";

/** حسابي: الدخول اختياري، ولا يُطلب إلا للمزامنة بين الأجهزة والختمة الجماعية والتذكير بالإشعارات. */
export function Account() {
  const { signedIn, displayName } = useAccount();

  return (
    <>
      <Sarlawh title="حسابي" />
      <main aria-labelledby="screen-title">
        {!hasApi ? (
          <Jadwal label="دون خادم">
            <p className="plan-name">سند يعمل على جهازك وحده</p>
            <p className="meta">لا خادم مُعدّ لهذه النسخة، فالتقدّم كله محفوظ على هذا الجهاز.</p>
          </Jadwal>
        ) : signedIn ? (
          <SignedIn displayName={displayName} />
        ) : (
          <SignInForm />
        )}

        <Preferences />

        <Hashiya>
          <p>
            لا نجمع أي بيان عن حالك، ولا يوجد حقل لذلك أصلاً. نيّة الختمة الجماعية مشفّرة ولا يراها إلا أعضاؤها. العدّادات
            المجهولة تُحصي الأحداث يومياً دون أي معرّف لك أو لجهازك.
          </p>
        </Hashiya>
      </main>
    </>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // حين يفرض الخادم CAPTCHA على التسجيل، يُنشأ الحساب من موقع سند (حيث الودجت) ثم يُدخل به هنا
  const [captcha, setCaptcha] = useState(false);
  useEffect(() => {
    authApi(api).providers().then((p) => setCaptcha(p.captchaEnabled), () => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "in") await signIn(email, password);
      else await register(email, password, name);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Jadwal label="الدخول">
      <p className="plan-name">{mode === "in" ? "ادخل إلى حسابك" : "أنشئ حساباً"}</p>
      <p className="meta">الحساب اختياري: يزامن خطتك بين أجهزتك، ويتيح الختمة مع أسرتك.</p>
      {mode === "up" && captcha ? (
        <div className="form">
          <p>أنشئ حسابك من موقع سند، ثم ادخل به هنا.</p>
          <div className="row-actions">
            {WEB_URL && (
              <a className="btn" href={`${WEB_URL}/register`} target="_blank" rel="noreferrer">
                أنشئ الحساب في موقع سند
              </a>
            )}
            <button type="button" className="link" onClick={() => setMode("in")}>
              لديّ حساب
            </button>
          </div>
        </div>
      ) : (
      <form className="form" onSubmit={submit}>
        {mode === "up" && (
          <label>
            اسمك
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="nickname" />
          </label>
        )}
        <label>
          البريد الإلكتروني
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "up" ? 10 : 1}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
          {mode === "up" && <span className="hint">عشرة أحرف على الأقل، فيها حرف لاتيني كبير وصغير ورقم.</span>}
        </label>
        {mode === "up" && (
          <label style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ minHeight: "auto", marginTop: ".35rem" }} />
            <span>
              أوافق على شروط الاستخدام وسياسة الخصوصية
              {WEB_URL && (
                <>
                  {" "}
                  (<a href={`${WEB_URL}/privacy`} target="_blank" rel="noreferrer">اقرأها</a>)
                </>
              )}
              .
            </span>
          </label>
        )}
        {error && (
          <p className="error-line" role="alert">
            {error}
          </p>
        )}
        <div className="row-actions">
          <Btn disabled={busy || (mode === "up" && !accepted)} onClick={undefined} submit>
            {mode === "in" ? "ادخل" : "أنشئ الحساب"}
          </Btn>
          <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "ليس لديّ حساب" : "لديّ حساب"}
          </button>
        </div>
      </form>
      )}
    </Jadwal>
  );
}

function SignedIn({ displayName }: { displayName: string | null }) {
  useEffect(() => {
    const pending = load<string | null>("pendingJoin", null);
    if (pending) navigate({ name: "join", code: pending });
  }, []);
  const reminder = useStore((s) => s.enrollment?.reminder);
  const [push, setPush] = useState(currentPush());
  const [choice, setChoice] = useState<Reminder>(push?.reminder ?? reminder ?? "after_fajr");
  const [time, setTime] = useState(push?.time ?? defaultTimes[reminder ?? "after_fajr"]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setPush(currentPush());
      setStatus(ok);
    } catch (e) {
      setStatus(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Jadwal label="حسابي">
      <p className="plan-name">السلام عليكم{displayName ? `، ${displayName}` : ""}</p>
      <p className="meta">خطتك تُزامَن بين أجهزتك، والختمة الجماعية متاحة لك.</p>

      <h3>تذكير الورد على هذا الجهاز</h3>
      {!pushSupported() ? (
        <p className="plan-sub">هذا المتصفح لا يدعم الإشعارات. على iPhone أضف سند إلى الشاشة الرئيسية أولاً.</p>
      ) : (
        <div className="form">
          <label>
            متى؟
            <select
              value={choice}
              onChange={(e) => {
                const r = e.target.value as Reminder;
                setChoice(r);
                setTime(defaultTimes[r]);
              }}
            >
              {(Object.keys(reminderLabels) as Reminder[]).map((r) => (
                <option key={r} value={r}>
                  {reminderLabels[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            الساعة
            <input type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} required />
            <span className="hint">تذكير واحد هادئ في اليوم: «وردك اليوم جاهز.»</span>
          </label>
          <div className="row-actions">
            <Btn disabled={busy || !time} onClick={() => run(() => enablePush(choice, time), "فُعّل التذكير على هذا الجهاز.")}>
              {push ? "حدّث التذكير" : "فعّل التذكير"}
            </Btn>
            {push && (
              <>
                <button type="button" className="link" disabled={busy} onClick={() => run(testPush, "أُرسل إشعار تجريبي.")}>
                  جرّب
                </button>
                <button type="button" className="link" disabled={busy} onClick={() => run(disablePush, "أُوقف التذكير.")}>
                  أوقفه
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {status && (
        <p className="plan-sub" role="status" style={{ marginTop: ".75rem" }}>
          {status}
        </p>
      )}

      <div className="row-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="link" onClick={() => void signOut()}>
          اخرج من الحساب
        </button>
      </div>
    </Jadwal>
  );
}

function Preferences() {
  const stats = useStore((s) => s.anonymousStats);

  return (
    <>
      <h2>تفضيلات</h2>
      <div className="form">
        {hasApi && (
          <label style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <input type="checkbox" checked={stats} onChange={(e) => actions.setAnonymousStats(e.target.checked)} style={{ minHeight: "auto" }} />
            شارك عدّادات مجهولة تساعد على تحسين سند
          </label>
        )}
      </div>
    </>
  );
}
