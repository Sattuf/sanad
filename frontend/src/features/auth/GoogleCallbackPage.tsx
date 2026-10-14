import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { useCompleteSignIn } from "../../api/hooks";
import type { AuthResponse } from "@sanad/shared/api/types";
import { Banner, Loading } from "../../components/ui";

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
