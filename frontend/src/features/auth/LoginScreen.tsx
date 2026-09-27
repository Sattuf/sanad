import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, ApiError, api } from "../../api/client";
import { useCompleteSignIn } from "../../api/hooks";
import type { AuthProviders, AuthResponse } from "../../api/types";
import { AnimatedLamp, ParticleField } from "../../components/motion/Lamp";
import { Banner, Button, Field, Input } from "../../components/ui";
import { SignInStages } from "./SignInStages";
import { CountryPhoneInput } from "./CountryPhoneInput";
import { captchaHeader } from "../../lib/captcha";

type Method = "email" | "phone" | null;

/**
 * شاشة الدخول الموحّدة (references/10 §10.4 + 13 §13.2): عمود بصري بالمصباح، وعمود وظيفي بثلاث طرق متكافئة.
 * بعد أي طريقة ناجحة: دخول مباشر بدور Beneficiary، بلا أي شاشة تطلب مستنداً.
 */
export function LoginScreen() {
  return (
    <div className="grid min-h-dvh bg-bg md:grid-cols-2">
      <div className="relative hidden items-center justify-center overflow-hidden md:flex" style={{ background: "var(--bg-deep)" }}>
        <AnimatedLamp />
        <ParticleField count={24} />
        <div className="absolute bottom-10 max-w-sm px-6 text-center">
          <p className="text-2xl font-bold">سند</p>
          <p className="mt-2 text-muted">دليل موثّق إدارياً لجهات ومستشارين، ومكتبة تلاوات وأدعية — مجاني بالكامل.</p>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm text-muted hover:text-text">
            → العودة للرئيسية
          </Link>
          <AuthMethodPicker />
        </div>
      </motion.div>
    </div>
  );
}

export function AuthMethodPicker() {
  const location = useLocation();
  const routeState = location.state as { from?: string; stage?: AuthResponse } | null;
  const [method, setMethod] = useState<Method>(null);
  const [stage, setStage] = useState<AuthResponse | null>(routeState?.stage ?? null);
  const [params] = useSearchParams();
  const complete = useCompleteSignIn();
  const navigate = useNavigate();
  const from = routeState?.from ?? "/dashboard";
  const providers = useQuery({ queryKey: ["auth-providers"], queryFn: () => api.get<AuthProviders>("/api/v1/auth/providers", { auth: false }) });

  const onResult = async (res: AuthResponse) => {
    if (await complete(res)) navigate(res.isNewUser ? "/onboarding/consent" : from, { replace: true });
    else setStage(res);
  };

  if (stage) return <SignInStages result={stage} onResult={onResult} onRestart={() => setStage(null)} />;

  return (
    <div className="mt-6">
      <h1 className="text-3xl font-bold">أهلاً بك في سند</h1>
      <p className="mt-2 text-muted">اختر طريقة الدخول. لا نطلب أي مستند — الحساب يُنشأ فوراً.</p>
      {params.get("error") === "google" && (
        <div className="mt-4">
          <Banner tone="warning">تعذّر إكمال الدخول بجوجل. حاول مجدداً أو اختر طريقة أخرى.</Banner>
        </div>
      )}

      {method === null && (
        <div className="mt-8 grid gap-3">
          <MethodButton onClick={() => setMethod("email")} icon="✉" label="البريد الإلكتروني" />
          <MethodButton
            onClick={() => (window.location.href = `${API_BASE}/api/v1/auth/google/challenge`)}
            icon="G"
            label="حساب جوجل"
            disabled={providers.data ? !providers.data.google : false}
            hint={providers.data && !providers.data.google ? "غير مُفعّل في هذه البيئة" : undefined}
          />
          <MethodButton onClick={() => setMethod("phone")} icon="☏" label="رقم الهاتف (رمز تحقق)" />
          <p className="mt-4 text-center text-sm text-muted">
            ليس لديك حساب؟{" "}
            <Link to="/register" className="font-semibold text-primary">
              أنشئ حساباً بالبريد
            </Link>{" "}
            — أو ادخل بجوجل أو الهاتف مباشرة.
          </p>
        </div>
      )}

      {method === "email" && <EmailLogin onResult={onResult} onBack={() => setMethod(null)} />}
      {method === "phone" && <PhoneLogin onResult={onResult} onBack={() => setMethod(null)} />}
    </div>
  );
}

function MethodButton({ icon, label, onClick, disabled, hint }: { icon: string; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-3 text-start transition-colors hover:border-primary disabled:opacity-50"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-primary" aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}

function EmailLogin({ onResult, onBack }: { onResult: (r: AuthResponse) => Promise<void>; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <form onSubmit={submit} className="mt-8 grid gap-4" noValidate>
      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="كلمة المرور" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      <Button type="submit" busy={busy}>
        دخول
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        طريقة أخرى
      </Button>
    </form>
  );
}

function PhoneLogin({ onResult, onBack }: { onResult: (r: AuthResponse) => Promise<void>; onBack: () => void }) {
  const [phone, setPhone] = useState("+966");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      // CAPTCHA يُضاف هنا عبر X-Captcha-Token عند تفعيله (Turnstile) — الخادم يرفض بدونه في الإنتاج
      await api.post("/api/v1/auth/phone/request-otp", { phoneNumber: phone.replace(/\s/g, "") }, { auth: false, headers: captchaHeader() });
      setSent(true);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "تعذّر إرسال الرمز.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const email_ = email.trim();
      await onResult(
        await api.post<AuthResponse>(
          "/api/v1/auth/phone/verify-otp",
          { phoneNumber: phone.replace(/\s/g, ""), code, email: email_ ? email_ : undefined },
          { auth: false },
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "رمز غير صحيح.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={verify} className="mt-8 grid gap-4" noValidate>
      <Field label="رقم الهاتف" htmlFor="phone">
        <CountryPhoneInput id="phone" value={phone} onChange={setPhone} disabled={sent} />
      </Field>
      {!sent && (
        <Field label="البريد الإلكتروني (اختياري)" htmlFor="phoneEmail" hint="لتصلك نسخة عن بياناتك ولاسترجاع حسابك — لن يُعرض لأحد.">
          <Input id="phoneEmail" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      {sent && (
        <Field label="رمز التحقق (6 أرقام)" htmlFor="otp" hint="صالح 5 دقائق، و5 محاولات كحد أقصى.">
          <Input id="otp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </Field>
      )}
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      {!sent ? (
        <Button type="button" busy={busy} onClick={requestCode}>
          أرسل رمز التحقق
        </Button>
      ) : (
        <>
          <Button type="submit" busy={busy} disabled={code.length !== 6}>
            تحقق ودخول
          </Button>
          <Button type="button" variant="secondary" disabled={cooldown > 0} onClick={requestCode}>
            {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : "إعادة إرسال الرمز"}
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" onClick={onBack}>
        طريقة أخرى
      </Button>
    </form>
  );
}

