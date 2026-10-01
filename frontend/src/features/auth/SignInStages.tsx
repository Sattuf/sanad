import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { AuthResponse, TwoFactorSetupInfo } from "@sanad/shared/api/types";
import { Banner, Button, Field, Input } from "../../components/ui";

/**
 * مراحل الدخول الوسيطة: تغيير كلمة مرور مؤقتة، إعداد التحقق الثنائي، إدخال رمزه.
 * الأدوار الإدارية لا تصل لأي عملية قبل إكمال 2FA (docs/adr/0010).
 */
export function SignInStages({ result, onResult, onRestart }: { result: AuthResponse; onResult: (r: AuthResponse) => Promise<void>; onRestart: () => void }) {
  const ticket = result.ticket ?? "";
  switch (result.stage) {
    case "RequiresPasswordChange":
      return <PasswordChange ticket={ticket} onResult={onResult} onRestart={onRestart} />;
    case "RequiresTwoFactorSetup":
      return <TwoFactorSetup ticket={ticket} onResult={onResult} onRestart={onRestart} />;
    case "RequiresTwoFactorCode":
      return <TwoFactorCode ticket={ticket} onResult={onResult} onRestart={onRestart} />;
    default:
      return null;
  }
}

function useSubmit(onResult: (r: AuthResponse) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<AuthResponse>) => {
    setBusy(true);
    setError(null);
    try {
      await onResult(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "حدث خطأ.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function PasswordChange({ ticket, onResult, onRestart }: { ticket: string; onResult: (r: AuthResponse) => Promise<void>; onRestart: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, run } = useSubmit(onResult);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) void run(() => api.post<AuthResponse>("/api/v1/auth/login/change-password", { ticket, newPassword: password }, { auth: false }));
      }}
    >
      <h1 className="text-2xl font-bold">غيّر كلمة المرور المؤقتة</h1>
      <p className="text-muted">لأمان حسابك، يلزم اختيار كلمة مرور جديدة قبل المتابعة.</p>
      <Field label="كلمة المرور الجديدة" htmlFor="np" hint="10 أحرف على الأقل، بحرف لاتيني كبير وصغير ورقم.">
        <Input id="np" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="تأكيد كلمة المرور" htmlFor="npc" error={mismatch ? "غير متطابقة" : undefined}>
        <Input id="npc" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      <Button type="submit" busy={busy} disabled={!password || mismatch}>
        متابعة
      </Button>
      <Button type="button" variant="ghost" onClick={onRestart}>
        البدء من جديد
      </Button>
    </form>
  );
}

/**
 * طلب واحد فقط لكل تذكرة: كل استدعاء لـ setup يولّد مفتاحاً جديداً، فإن تكرر (StrictMode يشغّل التأثير مرتين)
 * قد يعرض الـ QR مفتاحاً استُبدل في الخادم فترفض كل الرموز.
 */
const setupRequests = new Map<string, Promise<TwoFactorSetupInfo>>();
function beginSetupOnce(ticket: string): Promise<TwoFactorSetupInfo> {
  let request = setupRequests.get(ticket);
  if (!request) {
    request = api.post<TwoFactorSetupInfo>("/api/v1/auth/login/2fa/setup", { ticket }, { auth: false });
    request.catch(() => setupRequests.delete(ticket));
    setupRequests.set(ticket, request);
  }
  return request;
}

function TwoFactorSetup({ ticket, onResult, onRestart }: { ticket: string; onResult: (r: AuthResponse) => Promise<void>; onRestart: () => void }) {
  const [info, setInfo] = useState<TwoFactorSetupInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useSubmit(onResult);

  useEffect(() => {
    let active = true;
    beginSetupOnce(ticket)
      .then(async (i) => {
        if (!active) return;
        setInfo(i);
        setQr(await QRCode.toDataURL(i.authenticatorUri, { margin: 1, width: 200 }));
      })
      .catch((err) => active && setLoadError(err instanceof ApiError ? err.friendly : "تعذّر بدء الإعداد."));
    return () => {
      active = false;
    };
  }, [ticket]);

  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.post<AuthResponse>("/api/v1/auth/login/2fa/enable", { ticket, code }, { auth: false }));
      }}
    >
      <h1 className="text-2xl font-bold">فعّل التحقق الثنائي</h1>
      <p className="text-muted">حسابك يحمل صلاحيات إدارية. امسح الرمز بتطبيق مصادقة (مثل Google Authenticator أو Microsoft Authenticator) ثم أدخل الرمز الظاهر فيه.</p>
      {loadError && <Banner tone="danger" role="alert">{loadError}</Banner>}
      {info && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          {qr && <img src={qr} alt="رمز QR لإعداد تطبيق المصادقة" width={200} height={200} className="rounded-lg bg-white p-2" />}
          <p className="text-xs text-muted">أو أدخل المفتاح يدوياً:</p>
          <code dir="ltr" className="num select-all break-all rounded-lg bg-surface-2 px-3 py-2 text-sm">{info.sharedKey}</code>
        </div>
      )}
      <Field label="الرمز من تطبيق المصادقة" htmlFor="totp">
        <Input id="totp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      <Button type="submit" busy={busy} disabled={code.length !== 6 || !info}>
        تفعيل ودخول
      </Button>
      <Button type="button" variant="ghost" onClick={onRestart}>
        البدء من جديد
      </Button>
    </form>
  );
}

function TwoFactorCode({ ticket, onResult, onRestart }: { ticket: string; onResult: (r: AuthResponse) => Promise<void>; onRestart: () => void }) {
  const [code, setCode] = useState("");
  const { busy, error, run } = useSubmit(onResult);
  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.post<AuthResponse>("/api/v1/auth/login/2fa/verify", { ticket, code }, { auth: false }));
      }}
    >
      <h1 className="text-2xl font-bold">رمز التحقق الثنائي</h1>
      <p className="text-muted">أدخل الرمز الحالي من تطبيق المصادقة.</p>
      <Field label="الرمز" htmlFor="code2">
        <Input id="code2" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      <Button type="submit" busy={busy} disabled={code.length !== 6}>
        دخول
      </Button>
      <Button type="button" variant="ghost" onClick={onRestart}>
        البدء من جديد
      </Button>
    </form>
  );
}
