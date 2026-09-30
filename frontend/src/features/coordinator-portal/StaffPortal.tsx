import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, NavLink, Outlet, useSearchParams } from "react-router-dom";
import { ApiError, api, mediaUrl } from "../../api/client";
import { useMe } from "../../api/hooks";
import type {
  AudioCategory, AudioTrackAdmin, EscalationCase, OrganizationAdmin, OrganizationTrack, ProviderAdmin, ReportDetail, ReportItem, Role,
  SafetyAlert, UserPage, VerificationQueueItem,
} from "../../api/types";
import { TrackMedia } from "../../components/TrackMedia";
import { LibraryAddPanel } from "./LibraryAddPanel";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/format";

const tabs: Array<{ to: string; label: string; roles: Role[] }> = [
  { to: "/staff/verifications", label: "التوثيق", roles: ["Coordinator"] },
  { to: "/staff/organizations", label: "الجهات", roles: ["Coordinator"] },
  { to: "/staff/providers", label: "المختصون", roles: ["Coordinator"] },
  { to: "/staff/reports", label: "البلاغات والتصعيد", roles: ["Coordinator"] },
  { to: "/staff/safety-alerts", label: "تنبيهات السلامة", roles: ["Coordinator", "ClinicalSupervisor"] },
  { to: "/staff/library", label: "المكتبة", roles: ["ContentManager", "SystemAdmin"] },
  { to: "/staff/duas", label: "الأدعية المكتوبة", roles: ["ContentManager"] },
  { to: "/staff/users", label: "الأدوار", roles: ["SystemAdmin"] },
];

export function StaffLayout() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  const allowed = tabs.filter((t) => t.roles.some((r) => me.roles.includes(r)));
  const tab = ({ isActive }: { isActive: boolean }) => cx("rounded-lg px-3 py-2 text-sm font-semibold", isActive ? "bg-surface-2 text-primary" : "text-muted hover:text-text");
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2" aria-label="الإدارة">
        {allowed.map((t) => <NavLink key={t.to} to={t.to} className={tab}>{t.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}

export function StaffIndex() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  const first = tabs.find((t) => t.roles.some((r) => me.roles.includes(r)));
  return first ? <Navigate to={first.to} replace /> : <Navigate to="/dashboard" replace />;
}

/** رسالة موحّدة عند غياب جلسة 2FA (الخادم يعيد mfa_required). */
function StaffError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === "mfa_required")
    return <Banner tone="warning" title="يتطلب تحققاً ثنائياً">سجّل الخروج ثم ادخل مجدداً لإكمال إعداد التحقق الثنائي.</Banner>;
  return <ErrorState error={error} />;
}

// ── التوثيق ───────────────────────────────────────────────────────────────────
export function VerificationQueuePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["verification-queue"], queryFn: () => api.get<VerificationQueueItem[]>("/api/v1/admin/verifications") });
  if (queue.isLoading) return <Loading />;
  if (queue.error) return <StaffError error={queue.error} />;
  return (
    <div>
      <PageHeader title="قائمة التوثيق" subtitle="تحقق من تطابق نوع المستند مع النوع المُعلَن قبل أي اعتماد. عدم التطابق = رفض فوري." />
      {!queue.data?.length ? <EmptyState title="لا طلبات بانتظار المراجعة" /> : (
        <ul className="grid gap-3">
          {queue.data.map((item) => <li key={item.verification.id}><VerificationItem item={item} onDone={() => qc.invalidateQueries({ queryKey: ["verification-queue"] })} t={t} /></li>)}
        </ul>
      )}
    </div>
  );
}

function VerificationItem({ item, onDone, t }: { item: VerificationQueueItem; onDone: () => void; t: (k: string) => string }) {
  const v = item.verification;
  const [expires, setExpires] = useState(() => new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10));
  const [reason, setReason] = useState("DocumentUnreadable");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (decision: string) =>
      api.post<{ autoRejectedForDocumentMismatch: boolean; verification: { status: string } }>(`/api/v1/admin/verifications/${v.id}/review`, {
        decision, rejectionReason: decision === "Reject" ? reason : null, expiresAtUtc: decision.includes("Approve") ? new Date(expires).toISOString() : null,
      }),
    onSuccess: (r) => { setResult(r.autoRejectedForDocumentMismatch ? "رُفض تلقائياً: عدم تطابق نوع المستند مع نوع الممارسة." : `القرار: ${t(`verificationStatus.${r.verification.status}`)}`); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ."),
  });
  const openDoc = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/api/v1/admin/verifications/${v.id}/document-link`),
    onSuccess: (l) => window.open(mediaUrl(l.url), "_blank", "noopener,noreferrer"),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{item.applicantDisplayName ?? item.organizationName ?? "—"}</p>
          <p className="text-sm text-muted">
            {v.subjectType === "Organization" ? "جهة" : v.declaredPractitionerType && t(`practitionerType.${v.declaredPractitionerType}`)} · {v.declaredTitle} · {t(`documentType.${v.documentType}`)} · {v.issuingAuthority}
          </p>
          <p className="num text-xs text-muted">{formatDateTime(v.submittedAtUtc)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="lamp">{t(`verificationStatus.${v.status}`)}</Badge>
          {v.subjectType !== "Organization" && (item.documentMatchesDeclaredType ? <Badge tone="success">المستند يطابق النوع</Badge> : <Badge tone="danger">المستند لا يطابق النوع</Badge>)}
        </div>
      </div>
      {!item.documentMatchesDeclaredType && <div className="mt-3"><Banner tone="danger">هذا الطلب يجب أن يُرفض بسبب عدم التطابق — الاعتماد سيتحول تلقائياً لرفض.</Banner></div>}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {item.hasDocument && <Button variant="secondary" busy={openDoc.isPending} onClick={() => openDoc.mutate()}>عرض المستند (رابط مؤقت)</Button>}
        <Field label="ينتهي التوثيق في" htmlFor={`e-${v.id}`}><Input id={`e-${v.id}`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
        <Button busy={review.isPending} onClick={() => review.mutate("Approve")}>اعتماد</Button>
        <Button variant="secondary" busy={review.isPending} onClick={() => review.mutate("ConditionallyApprove")}>اعتماد مشروط</Button>
        <Button variant="secondary" busy={review.isPending} onClick={() => review.mutate("RequireCompletion")}>طلب استكمال</Button>
        <Select aria-label="سبب الرفض" value={reason} onChange={(e) => setReason(e.target.value)} className="w-auto">
          {["DocumentTypeMismatch", "DocumentUnreadable", "IssuerNotRecognized", "InformationInconsistent", "Other"].map((r) => <option key={r} value={r}>{t(`rejectionReason.${r}`)}</option>)}
        </Select>
        <Button variant="ghost" busy={review.isPending} onClick={() => review.mutate("Reject")}>رفض</Button>
      </div>
      {result && <div className="mt-3"><Banner tone="success">{result}</Banner></div>}
      {error && <div className="mt-3"><Banner tone="danger">{error}</Banner></div>}
    </Card>
  );
}

// ── الجهات ────────────────────────────────────────────────────────────────────
export function OrganizationsAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-orgs"], queryFn: () => api.get<OrganizationAdmin[]>("/api/v1/admin/organizations") });
  const [form, setForm] = useState({ legalName: "", tradeName: "", track: "WaqfFree" as OrganizationTrack, registrationNumber: "", issuingAuthorityName: "", verificationSourceUrl: "", publicDescription: "", city: "" });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-orgs"] });
  const create = useMutation({
    mutationFn: () => api.post("/api/v1/admin/organizations", Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" && !v.trim() && k !== "legalName" ? null : v]))),
    onSuccess: () => { refresh(); setForm((f) => ({ ...f, legalName: "", tradeName: "", publicDescription: "" })); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الحفظ."),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "publish" | "suspend" }) =>
      api.post(`/api/v1/admin/organizations/${id}/${action}`, action === "suspend" ? { reasonCode: "coordinator_decision" } : undefined),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ."),
  });
  if (list.error) return <StaffError error={list.error} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div>
        <PageHeader title="الجهات" subtitle="الاعتماد من قائمة التوثيق، ثم النشر صراحة — لا نشر بلا توثيق ساري." />
        {error && <Banner tone="danger">{error}</Banner>}
        {list.isLoading ? <Loading /> : (
          <ul className="mt-3 grid gap-2">
            {(list.data ?? []).map((o) => (
              <li key={o.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.tradeName ?? o.legalName}</p>
                    <p className="text-sm text-muted">{t(`track.${o.track}`)} · توثيق: {o.latestVerificationStatus ? t(`verificationStatus.${o.latestVerificationStatus}`) : "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone={o.status === "Published" ? "success" : "neutral"}>{t(`publication.${o.status}`)}</Badge>
                    {o.status !== "Published" && <Button variant="secondary" onClick={() => act.mutate({ id: o.id, action: "publish" })}>نشر</Button>}
                    {o.status === "Published" && <Button variant="ghost" onClick={() => act.mutate({ id: o.id, action: "suspend" })}>تعليق</Button>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Card>
        <h2 className="font-bold">إدخال جهة</h2>
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
          <Field label="الاسم الرسمي" htmlFor="ol"><Input id="ol" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></Field>
          <Field label="الاسم التجاري" htmlFor="ot"><Input id="ot" value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} /></Field>
          <Field label="المسار" htmlFor="otr">
            <Select id="otr" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value as OrganizationTrack })}>
              {(["WaqfFree", "DawahGuidance", "LicensedHealth", "IndependentConsultant"] as const).map((k) => <option key={k} value={k}>{t(`track.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label="رقم السجل" htmlFor="orn"><Input id="orn" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></Field>
          <Field label="جهة الإصدار" htmlFor="oia"><Input id="oia" value={form.issuingAuthorityName} onChange={(e) => setForm({ ...form, issuingAuthorityName: e.target.value })} /></Field>
          <Field label="رابط التحقق (HTTPS)" htmlFor="ou"><Input id="ou" dir="ltr" value={form.verificationSourceUrl} onChange={(e) => setForm({ ...form, verificationSourceUrl: e.target.value })} /></Field>
          <Field label="المدينة" htmlFor="oc"><Input id="oc" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="الوصف العام" htmlFor="od"><Textarea id="od" value={form.publicDescription} onChange={(e) => setForm({ ...form, publicDescription: e.target.value })} /></Field>
          <div><Button type="submit" busy={create.isPending} disabled={!form.legalName.trim() || !form.issuingAuthorityName.trim() || !form.publicDescription.trim()}>حفظ كمسودة</Button></div>
        </form>
      </Card>
    </div>
  );
}

export function ProvidersAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-providers"], queryFn: () => api.get<ProviderAdmin[]>("/api/v1/admin/providers") });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "suspend" | "lift-suspension" }) =>
      api.post(`/api/v1/admin/profiles/${id}/${action}`, action === "suspend" ? { reasonCode: "coordinator_decision" } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-providers"] }),
  });
  if (list.isLoading) return <Loading />;
  if (list.error) return <StaffError error={list.error} />;
  return (
    <div>
      <PageHeader title="مقدّمو الخدمة" />
      <ul className="grid gap-2">
        {(list.data ?? []).map((p) => (
          <li key={p.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{p.displayName}</p>
                <p className="text-sm text-muted">{t(`practitionerType.${p.practitionerType}`)} {p.suspensionReasonCode && `· ${p.suspensionReasonCode}`}</p>
              </div>
              <div className="flex gap-2">
                <Badge tone={p.status === "Published" ? "success" : p.status === "Suspended" ? "danger" : "neutral"}>{t(`publication.${p.status}`)}</Badge>
                {p.status === "Suspended" ? (
                  <Button variant="secondary" onClick={() => act.mutate({ id: p.id, action: "lift-suspension" })}>رفع التعليق</Button>
                ) : (
                  <Button variant="ghost" onClick={() => window.confirm("تعليق هذا الملف؟") && act.mutate({ id: p.id, action: "suspend" })}>تعليق</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── البلاغات والتصعيد ─────────────────────────────────────────────────────────
export function ReportsAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => api.get<ReportItem[]>("/api/v1/admin/reports") });
  const escalations = useQuery({ queryKey: ["admin-escalations"], queryFn: () => api.get<EscalationCase[]>("/api/v1/admin/escalations") });
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-reports"] }); void qc.invalidateQueries({ queryKey: ["admin-escalations"] }); };
  const recompute = useMutation({ mutationFn: (subjectAccountId: string) => api.post("/api/v1/admin/escalations/recompute", { subjectAccountId }), onSuccess: refresh });
  const close = useMutation({ mutationFn: (id: string) => api.post(`/api/v1/admin/escalations/${id}/close`), onSuccess: refresh });

  if (reports.isLoading) return <Loading />;
  if (reports.error) return <StaffError error={reports.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div>
        <PageHeader title="البلاغات المفتوحة" subtitle="البلاغ الموثَّق يرفع مستوى التصعيد تلقائياً — ولا ينخفض إلا بإعادة حساب صريحة منك." />
        {!reports.data?.length ? <EmptyState title="لا بلاغات مفتوحة" /> : (
          <ul className="grid gap-2">
            {reports.data.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{t(`reportCategory.${r.category}`)}</p>
                    <div className="flex gap-2">
                      <Badge tone={r.severity === "Critical" || r.severity === "High" ? "danger" : "lamp"}>{t(`reportSeverity.${r.severity}`)}</Badge>
                      <Badge>{r.targetType}</Badge>
                    </div>
                  </div>
                  <p className="num mt-1 text-xs text-muted">{formatDateTime(r.submittedAtUtc)}</p>
                  {open === r.id ? <ReportReview id={r.id} onDone={() => { setOpen(null); refresh(); }} /> : (
                    <Button variant="secondary" className="mt-3" onClick={() => setOpen(r.id)}>مراجعة</Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h2 className="mb-3 text-xl font-bold">ملفات التصعيد</h2>
        {escalations.isLoading ? <Loading /> : !escalations.data?.length ? <EmptyState title="لا ملفات تصعيد مفتوحة" /> : (
          <ul className="grid gap-2">
            {escalations.data.map((e) => (
              <li key={e.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={e.level === "Warning" ? "lamp" : "danger"}>{({ Warning: "تحذير", Restriction: "تقييد", Suspension: "تعليق", RegulatoryReferral: "إحالة تنظيمية" } as Record<string, string>)[e.level]}</Badge>
                    <span className="text-sm text-muted">بلاغات موثَّقة: <span className="num">{e.documentedReportsCount}</span></span>
                  </div>
                  <p className="num mt-2 break-all text-xs text-muted">{e.subjectAccountId}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" busy={recompute.isPending} onClick={() => recompute.mutate(e.subjectAccountId)}>إعادة حساب (مراجعة)</Button>
                    <Button variant="ghost" onClick={() => window.confirm("إغلاق ملف التصعيد؟") && close.mutate(e.id)}>إغلاق</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReportReview({ id, onDone }: { id: string; onDone: () => void }) {
  const detail = useQuery({ queryKey: ["admin-report", id], queryFn: () => api.get<ReportDetail>(`/api/v1/admin/reports/${id}`) });
  const [substantiated, setSubstantiated] = useState(false);
  const [crime, setCrime] = useState(false);
  const review = useMutation({ mutationFn: () => api.post(`/api/v1/admin/reports/${id}/review`, { substantiated, involvesPossibleCrimeOrMinorRisk: crime }), onSuccess: onDone });
  if (detail.isLoading) return <Loading />;
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">قراءة الوصف مُسجَّلة في التدقيق.</p>
      <p className="whitespace-pre-line leading-7">{detail.data?.description ?? "بلا وصف."}</p>
      <Checkbox id={`s-${id}`} checked={substantiated} onChange={setSubstantiated} label="البلاغ موثَّق بعد التحقق" />
      <Checkbox id={`c-${id}`} checked={crime} onChange={setCrime} label="يتضمن احتمال جريمة أو خطراً على قاصر (إحالة تنظيمية)" />
      <div className="flex gap-2">
        <Button busy={review.isPending} onClick={() => review.mutate()}>حفظ القرار</Button>
        <Button variant="ghost" onClick={onDone}>إغلاق</Button>
      </div>
    </div>
  );
}

export function SafetyAlertsPage() {
  const alerts = useQuery({ queryKey: ["safety-alerts"], queryFn: () => api.get<SafetyAlert[]>("/api/v1/admin/safety-alerts"), refetchInterval: 30_000 });
  const sourceLabel: Record<string, string> = { BookingBeneficiaryNote: "ملاحظة حجز", ConversationMessage: "رسالة محادثة", Report: "بلاغ" };
  if (alerts.isLoading) return <Loading />;
  if (alerts.error) return <StaffError error={alerts.error} />;
  return (
    <div>
      <PageHeader title="تنبيهات السلامة" subtitle="مؤشرات خطر رُصدت آلياً. المصدر والتوقيت فقط — النص نفسه لا يظهر هنا. تابِع عبر المسار الإشرافي الموثّق." />
      {!alerts.data?.length ? <EmptyState title="لا تنبيهات" /> : (
        <ul className="grid gap-2">
          {alerts.data.map((a) => (
            <li key={a.auditEntryId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 text-danger">
              <span className="font-semibold">{sourceLabel[a.source] ?? a.source}</span>
              <span className="num text-sm">{formatDateTime(a.occurredAtUtc)}</span>
              <span className="num w-full break-all text-xs opacity-80">مستخدم: {a.userId} · مصدر: {a.sourceEntityId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── المكتبة (ContentManager) ─────────────────────────────────────────────────
/** مجلدات المكتبة = تصنيفات AudioTrack. كل مجلد يحدد تلقائياً تصنيف ما يُضاف إليه. */
const libraryFolders: Array<{ id: AudioCategory; label: string; sourceHint: string }> = [
  { id: "QuranRecitation", label: "الآيات والتلاوات", sourceHint: "القارئ والرواية، مثلاً: مشاري العفاسي — حفص عن عاصم" },
  { id: "Dua", label: "الأدعية", sourceHint: "المرجع، مثلاً: من القرآن (البقرة 286) أو صحيح البخاري" },
  { id: "Adhkar", label: "الأذكار", sourceHint: "المرجع، مثلاً: حصن المسلم — أذكار المساء" },
];

const isFolder = (v: string | null): v is AudioCategory => libraryFolders.some((f) => f.id === v);

export function LibraryAdminPage() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  return me.roles.includes("ContentManager") ? <LibraryManager /> : <LibraryAccessGuide />;
}

/** يظهر للمدير: إدارة المكتبة من حساب مدير المحتوى حصراً (فصل المهام: من يمنح الصلاحيات لا ينشر المحتوى). */
function LibraryAccessGuide() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="إضافة الآيات والأدعية" subtitle="الإضافة والنشر في مكتبة الرقية من صلاحية «مدير المحتوى» فقط، ولا يمنح المدير هذا الدور لنفسه." />
      <Card>
        <ol className="grid list-decimal gap-2 ps-5 text-sm leading-7">
          <li>سجّل الخروج، ثم ادخل بحساب مدير المحتوى: <span dir="ltr" className="font-mono">content@sanad.local</span> (بيئة التطوير، كلمة المرور <span dir="ltr" className="font-mono">Demo-Pass-123</span>).</li>
          <li>أكمل إعداد التحقق الثنائي عند أول دخول.</li>
          <li>ادخل «الإدارة ← المكتبة»، اختر المجلد (الآيات والتلاوات، الأدعية، الأذكار)، ثم ارفع المقطع.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          أو امنح الدور لحساب آخر من <NavLink to="/staff/users" className="text-primary underline">الأدوار</NavLink>.
        </p>
      </Card>
    </div>
  );
}

function LibraryManager() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const folderParam = params.get("folder");
  const folder = isFolder(folderParam) ? folderParam : "QuranRecitation";
  const current = libraryFolders.find((f) => f.id === folder)!;
  const list = useQuery({ queryKey: ["admin-library"], queryFn: () => api.get<AudioTrackAdmin[]>("/api/v1/admin/library/tracks") });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-library"] }); void qc.invalidateQueries({ queryKey: ["library"] }); };
  const toggle = useMutation({
    mutationFn: (tr: AudioTrackAdmin) => api.post(`/api/v1/admin/library/tracks/${tr.id}/${tr.isPublished ? "unpublish" : "publish"}`),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ."),
  });
  const openFolder = (id: AudioCategory) => { setParams({ folder: id }, { replace: true }); setError(null); };

  if (list.error) return <StaffError error={list.error} />;
  const all = list.data ?? [];
  const tracks = all.filter((tr) => tr.category === folder);
  return (
    <div>
      <PageHeader title="إدارة مكتبة الرقية" subtitle="كل مقطع يُحفظ مسودة أولاً ولا يظهر للمستخدمين قبل نشره. كل وصف يمر على فلتر الادعاءات عند الإنشاء وقبل النشر." />
      <div className="mb-5 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="المجلدات">
        {libraryFolders.map((f) => {
          const items = all.filter((tr) => tr.category === f.id);
          const drafts = items.filter((tr) => !tr.isPublished).length;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={folder === f.id}
              onClick={() => openFolder(f.id)}
              className={cx("rounded-xl border p-4 text-start", folder === f.id ? "border-primary bg-surface-2" : "border-border bg-surface hover:border-primary/50")}
            >
              <p className="font-bold">📁 {f.label}</p>
              <p className="mt-1 text-sm text-muted">{items.length - drafts} منشور · {drafts} مسودة</p>
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
          <h2 className="font-bold">محتوى «{current.label}»</h2>
          {error && <div className="mt-2"><Banner tone="danger">{error}</Banner></div>}
          {list.isLoading ? <Loading /> : !tracks.length ? (
            <div className="mt-3"><EmptyState title="المجلد فارغ">أضف أول مقطع من النموذج المجاور.</EmptyState></div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {tracks.map((tr) => (
                <li key={tr.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold">{tr.title}</p>
                        <p className="text-sm text-muted">
                          {tr.sourceLabel} · {t(`audioCategory.${tr.category}`)}
                          {tr.sourceUrl && <> · <a href={tr.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">المصدر</a></>}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge tone={tr.isPublished ? "success" : "warning"}>{tr.isPublished ? "منشور" : "مسودة — غير ظاهر للمستخدمين"}</Badge>
                        <Button variant="secondary" busy={toggle.isPending && toggle.variables?.id === tr.id} onClick={() => toggle.mutate(tr)}>{tr.isPublished ? "سحب" : "نشر"}</Button>
                      </div>
                    </div>
                    <div className="mt-3"><TrackMedia track={tr} preview={!tr.isPublished} /></div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
        <LibraryAddPanel folder={folder} folderLabel={current.label} sourceHint={current.sourceHint} onAdded={refresh} />
      </div>
    </div>
  );
}

// ── الأدوار (SystemAdmin) — لا خيار لمنح SystemAdmin إطلاقاً (10 §10.9) ─────────
const assignable: Role[] = ["Coordinator", "ContentManager", "PrivacySecurityOfficer", "ClinicalSupervisor"];

export function UsersAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role>("Coordinator");
  const [error, setError] = useState<string | null>(null);
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => api.get<UserPage>(`/api/v1/admin/users?search=${encodeURIComponent(q)}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const assign = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/roles`, { role }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر المنح."),
  });
  const revoke = useMutation({
    mutationFn: ({ userId, r }: { userId: string; r: Role }) => api.del(`/api/v1/admin/users/${userId}/roles/${r}`),
    onSuccess: refresh,
  });
  if (users.error) return <StaffError error={users.error} />;
  return (
    <div>
      <PageHeader title="إدارة الأدوار" subtitle="منح الأدوار الإدارية يفرض التحقق الثنائي فوراً ويبطل جلسات المستخدم. SystemAdmin لا يُمنح من الواجهة." />
      <form className="mb-4 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <Input aria-label="بحث" placeholder="بحث بالبريد أو الاسم أو الهاتف" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Button type="submit" variant="secondary">بحث</Button>
        <Select aria-label="الدور المراد منحه" value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-auto">
          {assignable.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </Select>
      </form>
      {error && <Banner tone="danger">{error}</Banner>}
      {users.isLoading ? <Loading /> : (
        <ul className="grid gap-2">
          {(users.data?.items ?? []).map((u) => (
            <li key={u.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{u.displayName}</p>
                  <p className="text-sm text-muted" dir="ltr">{u.email ?? u.phoneNumber}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r} className="inline-flex items-center gap-1">
                        <Badge tone={r === "SystemAdmin" ? "danger" : "primary"}>{t(`role.${r}`)}</Badge>
                        {assignable.includes(r) && <button className="text-xs text-muted underline" onClick={() => revoke.mutate({ userId: u.id, r })}>سحب</button>}
                      </span>
                    ))}
                  </div>
                </div>
                {!u.roles.includes(role) && <Button variant="secondary" busy={assign.isPending && assign.variables === u.id} onClick={() => assign.mutate(u.id)}>منح «{t(`role.${role}`)}»</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
