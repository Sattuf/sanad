import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, ApiError, api } from "../../api/client";
import { useCompleteSignIn } from "../../api/hooks";
import type { AuthProviders, AuthResponse } from "@sanad/shared/api/types";
import { Banner, Button, Field, Input } from "../../components/ui";
import { SignInStages } from "./SignInStages";

/*
  الدخول على الويب بحساب جوجل فقط: زر واحد، بلا كلمات مرور ولا رموز هاتف ولا نماذج تسجيل.
  الحساب يُنشأ عند أول دخول بدور مستفيد (لا مستندات — البند 8).
  فريق العمل (حسابات إدارية بالبريد وتحقق ثنائي، ADR-0010) يدخل من /staff/login غير المربوط بأي واجهة عامة.
  تطبيقا الجوال وruqyah-app يحتفظان بطرقهما؛ نقاط الخادم لم تتغيّر.
*/

type RouteState = { from?: string; stage?: AuthResponse } | null;

/** مراحل ما بعد الدخول (تغيير كلمة مرور مؤقتة / تحقق ثنائي) — تصل من رد جوجل أيضاً لحسابات الفريق. */
function useSignInFlow() {
  const location = useLocation();
  const routeState = location.state as RouteState;
  const [stage, setStage] = useState<AuthResponse | null>(routeState?.stage ?? null);
  const complete = useCompleteSignIn();
  const navigate = useNavigate();
  const from = routeState?.from ?? "/dashboard";
  const onResult = async (res: AuthResponse) => {
    if (await complete(res)) navigate(res.isNewUser ? "/onboarding/consent" : from, { replace: true });
    else setStage(res);
  };
  return { stage, setStage, onResult, from };
}

function AuthShell({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-dawn px-4 py-10">
      <div className="pointer-events-none absolute -top-32 end-[-8rem] h-96 w-96 rounded-full bg-white/50 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 start-[-6rem] h-96 w-96 rounded-full bg-sky/70 blur-3xl" aria-hidden />
      <motion.main
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-[26rem]"
      >
        <Link to="/" className="mx-auto flex w-fit items-center gap-2" aria-label="سند — الرئيسية">
          <img src="/favicon.svg" alt="" width={44} height={44} className="rounded-2xl shadow-sm" />
          <span className="text-2xl font-bold">سند</span>
        </Link>
        <div className="mt-6 rounded-[2rem] border border-border bg-surface/90 p-7 shadow-xl backdrop-blur md:p-9">{children}</div>
      </motion.main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="var(--google-yellow)" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="var(--google-red)" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="var(--google-green)" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="var(--google-blue)" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const PROMISES = ["لا كلمة مرور تحفظها ولا رمز ينتظرك", "لا نطلب أي مستند — حسابك جاهز من أول دخول", "مجاني بالكامل، ويمكنك حذف حسابك متى شئت"];

export function LoginScreen() {
  const { stage, setStage, onResult } = useSignInFlow();
  const [params] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const providers = useQuery({ queryKey: ["auth-providers"], queryFn: () => api.get<AuthProviders>("/api/v1/auth/providers", { auth: false }) });
  const googleOff = providers.data ? !providers.data.google : false;

  if (stage)
    return (
      <AuthShell>
        <SignInStages result={stage} onResult={onResult} onRestart={() => setStage(null)} />
      </AuthShell>
    );

  return (
    <AuthShell>
      <h1 className="text-center text-2xl font-bold leading-snug">أهلاً بك في سند</h1>
      <p className="mt-2 text-center leading-7 text-muted">ادخل بحساب جوجل لتحفظ وِردك وتتابع حجوزاتك من أي جهاز.</p>

      {params.get("error") === "google" && (
        <div className="mt-5">
          <Banner tone="warning" role="alert">تعذّر إكمال الدخول بجوجل. حاول مجدداً.</Banner>
        </div>
      )}
      {googleOff && (
        <div className="mt-5">
          <Banner tone="warning">الدخول بجوجل غير مُفعّل في هذه البيئة بعد.</Banner>
        </div>
      )}

      <button
        type="button"
        disabled={googleOff || redirecting}
        onClick={() => {
          setRedirecting(true);
          window.location.href = `${API_BASE}/api/v1/auth/google/challenge`;
        }}
        className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--google-border)] bg-[var(--google-surface)] px-5 text-base font-semibold text-[var(--google-text)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
      >
        {redirecting ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--google-text)] border-t-transparent" aria-hidden /> : <GoogleMark />}
        {redirecting ? "جارٍ التحويل إلى جوجل…" : "المتابعة باستخدام Google"}
      </button>

      <ul className="mt-7 flex flex-col gap-2.5">
        {PROMISES.map((p) => (
          <li key={p} className="flex items-center gap-3 text-sm text-muted">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage text-xs text-success" aria-hidden>✓</span>
            {p}
          </li>
        ))}
      </ul>

      <div className="mt-7 rounded-2xl bg-surface-2 px-4 py-3 text-center text-sm leading-7">
        <span className="text-muted">لا تريد حساباً الآن؟ </span>
        <Link to="/today" className="font-semibold text-primary">ابدأ بلا تسجيل</Link>
        <span className="text-muted"> — برامجك ومذكّرتك تعمل على جهازك.</span>
      </div>

      <p className="mt-6 text-center text-xs leading-6 text-muted">
        بالمتابعة توافق على <Link to="/terms" className="underline">شروط الاستخدام</Link> و<Link to="/privacy" className="underline">سياسة الخصوصية</Link>.
      </p>
      {import.meta.env.DEV && (
        <p className="mt-3 text-center text-xs">
          <Link to="/staff/login" className="text-muted underline">بيئة التطوير: دخول بحسابات العرض</Link>
        </p>
      )}
    </AuthShell>
  );
}

/** دخول فريق العمل بالبريد وكلمة المرور ثم التحقق الثنائي (ADR-0010) — صفحة غير مربوطة بالواجهة العامة. */
export function StaffLoginScreen() {
  const { stage, setStage, onResult } = useSignInFlow();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (stage)
    return (
      <AuthShell>
        <SignInStages result={stage} onResult={onResult} onRestart={() => setStage(null)} />
      </AuthShell>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onResult(await api.post<AuthResponse>("/api/v1/auth/login/email", { email, password }, { auth: false }));
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "تعذّر الدخول.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-center text-2xl font-bold">دخول فريق العمل</h1>
      <p className="mt-2 text-center text-sm text-muted">للحسابات الإدارية فقط، ويتبعه التحقق الثنائي.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <Field label="البريد الإلكتروني" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="كلمة المرور" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Banner tone="danger" role="alert">{error}</Banner>}
        <Button type="submit" busy={busy}>
          دخول
        </Button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="text-muted underline">الدخول بحساب جوجل</Link>
      </p>
    </AuthShell>
  );
}
