import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, downloadJson, newIdempotencyKey } from "../../api/client";
import { queryKeys, useMe, useSignOut } from "../../api/hooks";
import { ACCESS_LOG_ACTION_LABELS, ACCESS_LOG_ROLE_LABELS, DELETE_CONFIRMATION } from "@sanad/shared/api/account";
import type { AccessLogEntry, AppNotification, BookingSummary, ConsentHistoryItem, ConsentStatus, ConsentType, Recommendation, ReportCategory, ReportSeverity } from "@sanad/shared/api/types";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { formatDate, formatDateTime } from "@sanad/shared/lib/format";
import { captchaHeader } from "../../lib/captcha";
import { statusTone } from "@sanad/shared/lib/status";

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const bookings = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get<BookingSummary[]>("/api/v1/me/bookings") });
  const recs = useQuery({ queryKey: ["recommendations"], queryFn: () => api.get<Recommendation[]>("/api/v1/me/recommendations") });
  if (!me) return <Loading />;
  const upcoming = (bookings.data ?? []).filter((b) => new Date(b.slotStartUtc) > new Date() && !["Cancelled", "Rejected"].includes(b.status)).slice(0, 3);
  const unread = (recs.data ?? []).filter((r) => !r.acknowledgedAtUtc).length;
  const isProvider = me.roles.includes("Practitioner");

  return (
    <div>
      <PageHeader title={`أهلاً ${me.displayName}`} subtitle="ما الذي تحتاجه اليوم؟" />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">مواعيدك القادمة</h2>
            <Link to="/bookings" className="text-sm text-primary">الكل</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-muted">لا مواعيد قادمة. <Link to="/directory" className="text-primary underline">تصفّح الدليل</Link></p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <Link to={`/bookings/${b.id}`} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
                    <span>{b.providerDisplayName} — <span className="num text-sm text-muted">{formatDateTime(b.slotStartUtc)}</span></span>
                    <Badge tone={statusTone(b.status)}>{t(`bookingStatus.${b.status}`)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">توصياتي</h2>
          <p className="mt-2 text-muted">{unread > 0 ? `لديك ${unread} توصية جديدة من مختصك.` : "لا توصيات جديدة."}</p>
          <Link to="/recommendations" className="mt-3 inline-block text-sm font-semibold text-primary">عرض التوصيات</Link>
        </Card>
        <Card>
          <h2 className="font-bold">الرقية والتحصين</h2>
          <p className="mt-2 text-muted">آيات الرقية وأدعية السنة وأذكار اليوم مكتوبة، وتلاوات مسموعة من مصادر موثوقة.</p>
          <div className="mt-3 flex gap-4">
            <Link to="/ruqyah" className="text-sm font-semibold text-primary">اقرأ الأذكار</Link>
            <Link to="/library" className="text-sm font-semibold text-primary">المكتبة الصوتية</Link>
          </div>
        </Card>
        {!isProvider && (
          <Card className="md:col-span-2">
            <h2 className="font-bold">{t("nav.becomeProvider")}</h2>
            <p className="mt-2 text-muted">
              شيخ أو راقٍ شرعي؟ اطلب الترقية بإجازتك أو تزكيتك. يبقى حسابك مستفيداً حتى يعتمد المنسق الطلب.
            </p>
            <Link to="/provider-upgrade" className="mt-3 inline-block text-sm font-semibold text-primary">
              {me.hasPendingUpgradeRequest ? "متابعة طلبي" : "طلب الترقية"}
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}

/** موافقات أول دخول (جوجل/الهاتف لا يمرّان بنموذج تسجيل). */
export function ConsentOnboardingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const types: ConsentType[] = ["TermsOfService", "PrivacyPolicy", ...(marketing ? (["MarketingCommunication"] as const) : [])];
      for (const type of types) await api.post("/api/v1/me/consent", { type });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      navigate("/dashboard", { replace: true });
    },
  });
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="قبل أن نبدأ" subtitle="موافقات أساسية لاستخدام سند. يمكنك مراجعتها وسحب الاختيارية منها لاحقاً من «حسابي»." />
      <Card className="grid gap-4">
        <Checkbox id="t" checked={terms} onChange={setTerms} label={<>أوافق على <Link className="text-primary underline" to="/terms">شروط الاستخدام</Link></>} />
        <Checkbox id="p" checked={privacy} onChange={setPrivacy} label={<>أوافق على <Link className="text-primary underline" to="/privacy">سياسة الخصوصية</Link></>} />
        <Checkbox id="m" checked={marketing} onChange={setMarketing} label="(اختياري) أرغب بتذكير يومي لطيف: دعاء أو آية اليوم" />
        {save.error && <Banner tone="danger">{save.error instanceof ApiError ? save.error.friendly : "تعذّر الحفظ"}</Banner>}
        <Button disabled={!terms || !privacy} busy={save.isPending} onClick={() => save.mutate()}>متابعة</Button>
      </Card>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function AccountPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showConsentHistory, setShowConsentHistory] = useState(false);
  const consents = useQuery({ queryKey: ["consent"], queryFn: () => api.get<ConsentStatus[]>("/api/v1/me/consent") });
  const consentHistory = useQuery({
    queryKey: ["consent-history"],
    queryFn: () => api.get<ConsentHistoryItem[]>("/api/v1/me/consent/history"),
    enabled: showConsentHistory,
  });
  const accessLog = useQuery({ queryKey: ["access-log"], queryFn: () => api.get<AccessLogEntry[]>("/api/v1/me/access-log") });

  const [hideIdentity, setHideIdentity] = useState<boolean | null>(null);
  const [quietHours, setQuietHours] = useState<{ start: number | null; end: number | null } | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: () => api.patch("/api/v1/me", { displayName: (name ?? "").trim() }),
    onSuccess: () => {
      setMessage("تم الحفظ.");
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  const savePrivacy = useMutation({
    mutationFn: (body: { hideIdentityUntilBookingConfirmed: boolean; quietHoursStartHourUtc: number | null; quietHoursEndHourUtc: number | null }) =>
      api.patch("/api/v1/me/privacy-preferences", body),
    onSuccess: () => {
      setPrivacyMessage("تم حفظ تفضيلات الخصوصية.");
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  const toggleConsent = useMutation({
    mutationFn: (c: ConsentStatus) => (c.accepted ? api.del(`/api/v1/me/consent/${c.type}`) : api.post("/api/v1/me/consent", { type: c.type })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consent"] }),
  });
  const exportData = useMutation({
    mutationFn: () => api.post<unknown>("/api/v1/me/export"),
    onSuccess: (data) => downloadJson(data, "sanad-my-data.json"),
  });
  const remove = useMutation({
    mutationFn: () => api.del("/api/v1/me", { confirmation: confirm }),
    onSuccess: async () => {
      await signOut();
      navigate("/", { replace: true });
    },
  });

  if (!me) return <Loading />;
  const currentHideIdentity = hideIdentity ?? me.hideIdentityUntilBookingConfirmed;
  const currentQuietHours = quietHours ?? { start: me.quietHoursStartHourUtc, end: me.quietHoursEndHourUtc };
  const quietHoursEnabled = currentQuietHours.start !== null && currentQuietHours.end !== null;
  const privacyDirty =
    currentHideIdentity !== me.hideIdentityUntilBookingConfirmed ||
    currentQuietHours.start !== me.quietHoursStartHourUtc ||
    currentQuietHours.end !== me.quietHoursEndHourUtc;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader title="حسابي" subtitle={me.roles.map((r) => t(`role.${r}`)).join(" · ")} />
      <Card>
        <h2 className="font-bold">البيانات الأساسية</h2>
        <div className="mt-3 grid gap-3">
          <Field label="الاسم الظاهر" htmlFor="dn" hint="هو ما يراه المختصون والمنسقون في حجوزاتك.">
            <Input id="dn" value={name ?? me.displayName} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="email">
            <div className="flex items-center gap-2">
              <Input id="email" value={me.email ?? "—"} disabled className="opacity-80" />
              {me.email && <Badge tone={me.emailConfirmed ? "success" : "warning"}>{me.emailConfirmed ? "موثّق" : "غير موثّق"}</Badge>}
            </div>
          </Field>
          {me.phoneNumber && <p className="text-sm text-muted">رقم الجوال: {me.phoneNumber}</p>}
          {message && <Banner tone="success">{message}</Banner>}
          <div><Button disabled={!name || name.trim() === me.displayName} busy={rename.isPending} onClick={() => rename.mutate()}>حفظ</Button></div>
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">الخصوصية</h2>
        <div className="mt-3 grid gap-4">
          <Checkbox
            id="hideIdentity"
            checked={currentHideIdentity}
            onChange={(v) => setHideIdentity(v)}
            label="إخفاء اسمي عن المختص حتى تأكيد الحجز"
            hint="يظهر اسمك للمختص باسم «مستفيد» إلى أن يقبل طلب حجزك، ثم يظهر اسمك الحقيقي."
          />
          <div>
            <Checkbox
              id="quietHours"
              checked={quietHoursEnabled}
              onChange={(v) => setQuietHours(v ? { start: currentQuietHours.start ?? 22, end: currentQuietHours.end ?? 7 } : { start: null, end: null })}
              label="ساعات هدوء (بتوقيت UTC)"
              hint="لا تصلك خلالها إشعارات غير عاجلة عبر القنوات الخارجية — تنبيهات السلامة العاجلة تصل دائماً."
            />
            {quietHoursEnabled && (
              <div className="mt-2 flex items-center gap-2 ps-7">
                <Select value={currentQuietHours.start ?? 22} onChange={(e) => setQuietHours({ start: Number(e.target.value), end: currentQuietHours.end })}>
                  {HOURS.map((h) => <option key={h} value={h}>{h.toString().padStart(2, "0")}:00</option>)}
                </Select>
                <span className="text-sm text-muted">إلى</span>
                <Select value={currentQuietHours.end ?? 7} onChange={(e) => setQuietHours({ start: currentQuietHours.start, end: Number(e.target.value) })}>
                  {HOURS.map((h) => <option key={h} value={h}>{h.toString().padStart(2, "0")}:00</option>)}
                </Select>
              </div>
            )}
          </div>
          {privacyMessage && <Banner tone="success">{privacyMessage}</Banner>}
          <div>
            <Button
              disabled={!privacyDirty}
              busy={savePrivacy.isPending}
              onClick={() =>
                savePrivacy.mutate({
                  hideIdentityUntilBookingConfirmed: currentHideIdentity,
                  quietHoursStartHourUtc: currentQuietHours.start,
                  quietHoursEndHourUtc: currentQuietHours.end,
                })
              }
            >
              حفظ تفضيلات الخصوصية
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">الموافقات</h2>
        {consents.isLoading ? <Loading /> : (
          <ul className="mt-3 grid gap-2">
            {(consents.data ?? []).map((c) => {
              const optional = c.type === "MarketingCommunication" || c.type === "SensitiveDataProcessing";
              return (
                <li key={c.type} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 py-3">
                  <div>
                    <span>{t(`consent.${c.type}`)} {c.needsReacceptance && <Badge tone="lamp">إصدار جديد</Badge>}</span>
                    {c.accepted && c.acceptedAtUtc && (
                      <p className="mt-1 text-xs text-muted">
                        وافقتَ على الإصدار {c.acceptedVersion} بتاريخ <span className="num">{formatDate(c.acceptedAtUtc)}</span>
                      </p>
                    )}
                  </div>
                  {optional ? (
                    <Button variant="secondary" busy={toggleConsent.isPending && toggleConsent.variables?.type === c.type} onClick={() => toggleConsent.mutate(c)}>
                      {c.accepted ? "سحب الموافقة" : "موافقة"}
                    </Button>
                  ) : (
                    <Badge tone={c.accepted ? "success" : "warning"}>{c.accepted ? "موافق" : "مطلوبة"}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setShowConsentHistory((v) => !v)}>
          {showConsentHistory ? "إخفاء سجل الموافقات السابقة" : "عرض سجل الموافقات السابقة"}
        </button>
        {showConsentHistory && (
          consentHistory.isLoading ? <Loading /> : (consentHistory.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">لا سجل سابق.</p>
          ) : (
            <ul className="mt-2 grid gap-1">
              {(consentHistory.data ?? []).map((h, i) => (
                <li key={i} className="text-xs text-muted">
                  {t(`consent.${h.type}`)} — الإصدار {h.policyVersion} — <span className="num">{formatDateTime(h.acceptedAtUtc)}</span>
                  {h.revokedAtUtc && <> (سُحبت بتاريخ <span className="num">{formatDateTime(h.revokedAtUtc)}</span>)</>}
                </li>
              ))}
            </ul>
          )
        )}
      </Card>
      <Card>
        <h2 className="font-bold">من اطّلع على بياناتك؟</h2>
        <p className="mt-1 text-sm text-muted">سجل شفاف بكل مرة اطّلع فيها مختص أو منسق أو مشرف على ملاحظاتك أو ملف حجزك.</p>
        {accessLog.isLoading ? <Loading /> : (accessLog.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">لا أحد اطّلع على بياناتك حتى الآن.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {(accessLog.data ?? []).map((e, i) => (
              <li key={i} className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <p>{ACCESS_LOG_ACTION_LABELS[e.action] ?? e.action}</p>
                <p className="mt-1 text-xs text-muted">
                  {ACCESS_LOG_ROLE_LABELS[e.actorRole] ?? e.actorRole} — <span className="num">{formatDateTime(e.occurredAtUtc)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-bold">بياناتي</h2>
        <p className="mt-2 text-sm text-muted">نزّل نسخة من كل بياناتك في سند (JSON).</p>
        <Button className="mt-3" variant="secondary" busy={exportData.isPending} onClick={() => exportData.mutate()}>تصدير بياناتي</Button>
      </Card>
      <Card className="border-danger/40">
        <h2 className="font-bold text-danger">حذف الحساب</h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          تُحذف بياناتك الشخصية نهائياً، وتُجرَّد السجلات المرتبطة (حجوزات، توصيات مستلمة) من هويتك دون حذف أثرها الإداري. لا يمكن التراجع.
        </p>
        <Field label="اكتب «احذف حسابي» للتأكيد" htmlFor="del">
          <Input id="del" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {remove.error && <div className="mt-2"><Banner tone="danger">{remove.error instanceof ApiError ? remove.error.friendly : "تعذّر الحذف"}</Banner></div>}
        <Button className="mt-3" variant="danger" disabled={confirm !== DELETE_CONFIRMATION} busy={remove.isPending} onClick={() => remove.mutate()}>حذف حسابي نهائياً</Button>
      </Card>
    </div>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<AppNotification[]>("/api/v1/me/notifications") });
  const readAll = useMutation({ mutationFn: () => api.post("/api/v1/me/notifications/read-all"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الإشعارات" actions={data?.some((n) => !n.isRead) && <Button variant="secondary" onClick={() => readAll.mutate()}>تعليم الكل كمقروء</Button>} />
      {!data || data.length === 0 ? <EmptyState title="لا إشعارات" /> : (
        <ul className="grid gap-2">
          {data.map((n) => (
            <li key={n.id}>
              <Link to={n.link ?? "#"} className="block">
                <Card className={n.isRead ? "opacity-75" : "border-lamp/50"}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{n.title}</p>
                    <span className="num text-xs text-muted">{formatDateTime(n.createdAtUtc)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{n.body}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** نموذج بلاغ عام (مقدّم خدمة / جهة / مستخدم) — خلف CAPTCHA ومفتاح تكرار. */
export function ReportPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [category, setCategory] = useState<ReportCategory>("UnauthorizedClaim");
  const [severity, setSeverity] = useState<ReportSeverity>("Medium");
  const [description, setDescription] = useState("");
  const [key] = useState(newIdempotencyKey);
  const submit = useMutation({
    mutationFn: () =>
      api.post("/api/v1/reports", { targetType: params.get("targetType"), targetId: params.get("targetId"), category, severity, description: description.trim() || null }, {
        headers: { "Idempotency-Key": key, ...captchaHeader() },
      }),
  });
  if (submit.isSuccess)
    return <div className="mx-auto max-w-lg"><Banner tone="success" title="وصل بلاغك">سيراجعه فريق التنسيق. شكراً لمساعدتك في حماية الآخرين.</Banner></div>;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="إبلاغ" subtitle="البلاغات الموثَّقة تؤثر تدريجياً على ظهور الحساب، ولا تُتخذ قرارات آلياً دون مراجعة منسق." />
      <Card className="grid gap-4">
        <Field label="نوع المشكلة" htmlFor="cat">
          <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
            {(["UnauthorizedClaim", "Impersonation", "FinancialExploitation", "Harassment", "PrivacyViolation", "Other"] as const).map((c) => (
              <option key={c} value={c}>{t(`reportCategory.${c}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label="الخطورة" htmlFor="sev">
          <Select id="sev" value={severity} onChange={(e) => setSeverity(e.target.value as ReportSeverity)}>
            {(["Low", "Medium", "High", "Critical"] as const).map((s) => <option key={s} value={s}>{t(`reportSeverity.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label="وصف مختصر (يُحفظ مشفّراً)" htmlFor="desc">
          <Textarea id="desc" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {submit.error && <Banner tone="danger">{submit.error instanceof ApiError ? submit.error.friendly : "تعذّر الإرسال"}</Banner>}
        <Button busy={submit.isPending} disabled={!params.get("targetId")} onClick={() => submit.mutate()}>إرسال البلاغ</Button>
      </Card>
    </div>
  );
}
