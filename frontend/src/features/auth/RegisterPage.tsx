import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useEffect } from "react";
import { ApiError, api } from "../../api/client";
import { useCompleteSignIn } from "../../api/hooks";
import type { AuthResponse } from "../../api/types";
import { Banner, Button, Card, Checkbox, Field, Input, Loading } from "../../components/ui";
import { captchaHeader } from "../../lib/captcha";

// يطابق RegisterWithEmailCommandValidator في الخادم
const schema = z.object({
  displayName: z.string().trim().min(1, "الاسم مطلوب").max(100),
  email: z.string().trim().email("بريد غير صالح"),
  password: z
    .string()
    .min(10, "10 أحرف على الأقل")
    .regex(/[A-Z]/, "حرف لاتيني كبير واحد على الأقل")
    .regex(/[a-z]/, "حرف لاتيني صغير واحد على الأقل")
    .regex(/[0-9]/, "رقم واحد على الأقل"),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "مطلوب" }) }),
  acceptPrivacyPolicy: z.literal(true, { errorMap: () => ({ message: "مطلوب" }) }),
});
type Form = z.infer<typeof schema>;

export function RegisterPage() {
  const { register, handleSubmit, setValue, watch, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { acceptTerms: false as unknown as true, acceptPrivacyPolicy: false as unknown as true },
  });
  const [error, setError] = useState<string | null>(null);
  const complete = useCompleteSignIn();
  const navigate = useNavigate();

  const onSubmit = async (values: Form) => {
    setError(null);
    try {
      const res = await api.post<AuthResponse>("/api/v1/auth/register/email", values, { auth: false, headers: captchaHeader() });
      if (await complete(res)) navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "تعذّر إنشاء الحساب.");
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-bold">إنشاء حساب</h1>
      <p className="mt-2 text-muted">حساب مستفيد فوري ومجاني — بلا أي مستند. يمكنك لاحقاً طلب الترقية لمقدّم خدمة من لوحتك.</p>
      <Card className="mt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Field label="الاسم الظاهر" htmlFor="dn" error={formState.errors.displayName?.message}>
            <Input id="dn" autoComplete="name" {...register("displayName")} />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="em" error={formState.errors.email?.message}>
            <Input id="em" type="email" dir="ltr" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="كلمة المرور" htmlFor="pw" hint="10 أحرف على الأقل، بحرف لاتيني كبير وصغير ورقم." error={formState.errors.password?.message}>
            <Input id="pw" type="password" dir="ltr" autoComplete="new-password" {...register("password")} />
          </Field>
          <Checkbox
            id="terms"
            checked={Boolean(watch("acceptTerms"))}
            onChange={(v) => setValue("acceptTerms", v as true, { shouldValidate: true })}
            label={<>أوافق على <Link to="/terms" className="text-primary underline">شروط الاستخدام</Link></>}
          />
          <Checkbox
            id="privacy"
            checked={Boolean(watch("acceptPrivacyPolicy"))}
            onChange={(v) => setValue("acceptPrivacyPolicy", v as true, { shouldValidate: true })}
            label={<>أوافق على <Link to="/privacy" className="text-primary underline">سياسة الخصوصية</Link></>}
          />
          {(formState.errors.acceptTerms || formState.errors.acceptPrivacyPolicy) && (
            <p className="text-xs font-semibold text-danger">الموافقة على الشروط والخصوصية مطلوبة.</p>
          )}
          {error && <Banner tone="danger" role="alert">{error}</Banner>}
          <Button type="submit" busy={formState.isSubmitting}>
            إنشاء الحساب
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        لديك حساب؟ <Link to="/login" className="font-semibold text-primary">ادخل</Link>
      </p>
    </div>
  );
}

/** استبدال رمز جوجل لمرة واحدة بالجلسة — الرموز لا تمر في الرابط أبداً. */
export function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const complete = useCompleteSignIn();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      navigate("/login?error=google", { replace: true });
      return;
    }
    api
      .post<AuthResponse>("/api/v1/auth/google/exchange", { code }, { auth: false })
      .then(async (res) => {
        if (await complete(res)) navigate(res.isNewUser ? "/onboarding/consent" : "/dashboard", { replace: true });
        else navigate("/login", { replace: true, state: { stage: res } });
      })
      .catch((err) => setError(err instanceof ApiError ? err.friendly : "تعذّر إكمال الدخول."));
  }, [params, complete, navigate]);

  if (error)
    return (
      <div className="mx-auto max-w-md">
        <Banner tone="warning" title="تعذّر الدخول بجوجل">
          {error} <Link to="/login" className="underline">العودة</Link>
        </Banner>
      </div>
    );
  return <Loading />;
}
