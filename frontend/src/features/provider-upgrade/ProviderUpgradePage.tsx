import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../../api/client";
import { queryKeys, useMe } from "../../api/hooks";
import type { PractitionerType, UploadedFile, VerificationSummary } from "@sanad/shared/api/types";
import { Badge, Banner, Button, Card, Field, Input, Loading, PageHeader, Select } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "@sanad/shared/lib/format";
import { captchaHeader } from "../../lib/captcha";

const docsByType: Record<PractitionerType, Array<{ value: string; hint: string }>> = {
  ReligiousPractitioner: [
    { value: "ShariaIjazah", hint: "إجازة شرعية من جهة معروفة" },
    { value: "ShariaEndorsement", hint: "تزكية من جهة شرعية معروفة" },
  ],
};

/**
 * طلب الترقية (10 §10.5): اختيار النوع صراحة، ثم نموذج مستندات يتغيّر حسب النوع.
 * بعد الإرسال: "قيد المراجعة" — لا تغيير فوري في الدور.
 */
export function ProviderUpgradePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const requests = useQuery({ queryKey: ["upgrade-requests"], queryFn: () => api.get<VerificationSummary[]>("/api/v1/me/provider-upgrade-requests") });
  const [type, setType] = useState<PractitionerType | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [authority, setAuthority] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file!);
      const uploaded = await api.post<UploadedFile>("/api/v1/me/documents", form);
      return api.post<VerificationSummary>(
        "/api/v1/me/provider-upgrade-request",
        { requestedType: type, declaredTitle: title.trim(), documentType, issuingAuthority: authority.trim(), uploadedDocumentFileId: uploaded.id },
        { headers: captchaHeader() },
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["upgrade-requests"] });
      await qc.invalidateQueries({ queryKey: queryKeys.me });
    },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر إرسال الطلب."),
  });

  if (!me || requests.isLoading) return <Loading />;
  const pending = requests.data?.find((r) => r.status === "PendingReview" || r.status === "RequiresCompletion");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="كن مقدّم خدمة" subtitle="التوثيق إداري: نتحقق من مستندك الرسمي وجهة إصداره. يبقى حسابك «مستفيد» حتى يعتمد المنسق طلبك." />

      {requests.data && requests.data.length > 0 && (
        <Card className="mb-4">
          <h2 className="font-bold">طلباتي</h2>
          <ul className="mt-3 grid gap-2">
            {requests.data.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{r.declaredPractitionerType && t(`practitionerType.${r.declaredPractitionerType}`)} — {t(`documentType.${r.documentType}`)}</span>
                  <Badge tone={r.status === "Approved" ? "success" : r.status === "Rejected" ? "danger" : "lamp"}>{t(`verificationStatus.${r.status}`)}</Badge>
                </div>
                {r.rejectionReason && <p className="mt-1 text-sm text-danger">السبب: {t(`rejectionReason.${r.rejectionReason}`)}</p>}
                <p className="num mt-1 text-xs text-muted">{formatDateTime(r.submittedAtUtc)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {me.roles.includes("Practitioner") ? (
        <Banner tone="success" title="حسابك معتمد كمقدّم خدمة">أكمل ملفك وانشره من «بوابة المختص».</Banner>
      ) : pending ? (
        <Banner tone="lamp" title="طلبك قيد المراجعة">سنُعلمك فور صدور القرار. لا تحتاج لأي إجراء الآن.</Banner>
      ) : submit.isSuccess ? (
        <Banner tone="success" title="أُرسل الطلب">طلبك قيد المراجعة الآن.</Banner>
      ) : (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
          <Card>
            <h2 className="font-bold">١. اختر نوعك</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="نوع الممارسة">
              {(["ReligiousPractitioner"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={type === k}
                  onClick={() => { setType(k); setDocumentType(docsByType[k][0].value); }}
                  className={cx("rounded-2xl border-2 px-4 py-4 text-start", type === k ? "border-primary bg-surface-2" : "border-border bg-surface")}
                >
                  <span className="font-bold">{t(`practitionerType.${k}`)}</span>
                  <span className="mt-1 block text-sm text-muted">إجازة أو تزكية شرعية</span>
                </button>
              ))}
            </div>
          </Card>
          {type && (
            <Card className="grid gap-4">
              <h2 className="font-bold">٢. المستند الرسمي</h2>
              <Field label="اللقب المهني كما تريد أن يظهر" htmlFor="title" hint="بلا وعود بالشفاء — سيُفحص آلياً.">
                <Input id="title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: راقٍ شرعي مجاز" />
              </Field>
              <Field label="نوع المستند" htmlFor="dt" hint={docsByType[type].find((d) => d.value === documentType)?.hint}>
                <Select id="dt" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                  {docsByType[type].map((d) => <option key={d.value} value={d.value}>{t(`documentType.${d.value}`)}</option>)}
                </Select>
              </Field>
              <Field label="جهة الإصدار" htmlFor="auth">
                <Input id="auth" maxLength={200} value={authority} onChange={(e) => setAuthority(e.target.value)} />
              </Field>
              <Field label="ملف المستند" htmlFor="doc" hint="PDF أو JPG أو PNG، حتى 10 ميجابايت. لا يطّلع عليه إلا المنسق عبر رابط مؤقت.">
                <input id="doc" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
              </Field>
              {error && <Banner tone="danger" role="alert">{error}</Banner>}
              <div><Button type="submit" busy={submit.isPending} disabled={!title.trim() || !authority.trim() || !file}>إرسال الطلب</Button></div>
            </Card>
          )}
        </form>
      )}
    </div>
  );
}
