import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { useMe } from "../../api/hooks";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "@sanad/shared/lib/format";
import { quran, type QuranKey } from "@sanad/shared/content/quran";
import { daysFromPatterns, patternsFromDays, type ItemKind, type PlanDay, type PlanItem } from "./companionPlanDays";

/*
  إدارة تطبيق «سند» للرقية الذاتية (ADR-0021). الخادم يفرض كل القواعد؛ الواجهة تعكسها:
  - المعدّ: لا نشر دون إذنه المكتوب مسجَّلاً، وتعديل اسمه أو نبذته يُسقط الإذن.
  - الخطة: مسودة ← مراجعة ← نشر بيد مدير محتوى غير منشئها مع إقرار فحص الأمان بنداً بنداً. المنشور لا يُعدَّل؛ يُنشأ إصدار جديد.
*/

const fail = (set: (s: string | null) => void) => (err: unknown) => set(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ.");

// ── الأنواع ─────────────────────────────────────────────────────────────────

type PlanStatus = "Draft" | "InReview" | "Published" | "Superseded" | "Withdrawn";

interface AdminPlan {
  id: string; key: string; version: number; title: string; summary: string; contents: string; authorId: string; authorName: string;
  authorHasConsent: boolean; durationDays: number; minutesPerDay: number; days: PlanDay[]; status: PlanStatus; isMine: boolean;
  canReview: boolean; reviewNote: string | null; withdrawReason: string | null; publishedAtUtc: string | null; safetyCheckedAtUtc: string | null;
  createdAtUtc: string;
}

interface AdminAuthor {
  id: string; displayName: string; bio: string; hasConsent: boolean; consentRef: string | null; consentDate: string | null;
  publishedPlans: number; createdAtUtc: string;
}

const statusLabel: Record<PlanStatus, { label: string; tone: "neutral" | "lamp" | "success" | "warning" }> = {
  Draft: { label: "مسودة", tone: "neutral" },
  InReview: { label: "بانتظار المراجعة", tone: "lamp" },
  Published: { label: "منشورة", tone: "success" },
  Superseded: { label: "مستبدلة بإصدار أحدث", tone: "neutral" },
  Withdrawn: { label: "مسحوبة", tone: "warning" },
};

/** بنود فحص الأمان — content-guardrails.md §3. لا نشر قبل إقرارها كلها. */
const safetyChecks = [
  ["noSymptomQuestions", "لا جدول أعراض ولا أسئلة لتحديد «نوع الإصابة»"],
  ["noConditionLabels", "الخطة موصوفة بمحتواها ومدتها، لا بحالة (سحر مأكول، مس عاشق…)"],
  ["noHealingPromise", "لا وعد بالشفاء ولا تحديد مدة له"],
  ["noSales", "لا ماء ولا زيت ولا عسل مقروء عليه للبيع، ولا إحالة لمن يبيعه"],
  ["noExhaustingPractices", "لا صيام طويل ولا سهر ولا ممارسة جسدية مرهقة"],
  ["noWorseningAsProof", "لا إيحاء بأن اشتداد الأعراض دليل على الإصابة"],
  ["noDreamInterpretation", "لا تفسير أحلام"],
] as const;
type Safety = Record<(typeof safetyChecks)[number][0], boolean>;
const noChecks = Object.fromEntries(safetyChecks.map(([k]) => [k, false])) as Safety;

const passages = Object.entries(quran).map(([key, p]) => ({
  key: key as QuranKey,
  label: `${p.surahName} ${p.from === p.to ? p.from : `${p.from}–${p.to}`}`,
}));

// ── الصفحة ───────────────────────────────────────────────────────────────────

export function CompanionPlansAdminPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<"plans" | "authors">("plans");
  if (!me) return <Loading />;
  if (!me.roles.includes("ContentManager"))
    return <Banner tone="warning" title="لمدير المحتوى فقط">إعداد خطط الرقية ومراجعتها من صلاحية «مدير المحتوى».</Banner>;
  return (
    <div>
      <PageHeader
        title="خطط الرقية — تطبيق سند"
        subtitle="كل خطة باسم معدّها وبإذنه المكتوب، تراجعها مراجعة شرعية من مدير محتوى غير منشئها مع فحص الأمان، ثم تُنشر برقم إصدار."
      />
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="القسم">
        {(["plans", "authors"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
          >
            {t === "plans" ? "الخطط" : "المعدّون وأذونهم"}
          </button>
        ))}
      </div>
      {tab === "plans" ? <PlansSection /> : <AuthorsSection />}
    </div>
  );
}

// ── المعدّون ────────────────────────────────────────────────────────────────

function AuthorsSection() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["companion-authors"], queryFn: () => api.get<AdminAuthor[]>("/api/v1/admin/companion/authors") });
  const [editing, setEditing] = useState<{ id: string | null; displayName: string; bio: string } | null>(null);
  const [consent, setConsent] = useState<{ id: string; ref: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ["companion-authors"] });
    void qc.invalidateQueries({ queryKey: ["companion-plans"] });
  };

  const save = useMutation({
    mutationFn: (e: { id: string | null; displayName: string; bio: string }) =>
      e.id ? api.put(`/api/v1/admin/companion/authors/${e.id}`, e) : api.post("/api/v1/admin/companion/authors", e),
    onSuccess: () => { setEditing(null); refresh(); },
    onError: fail(setError),
  });
  const record = useMutation({
    mutationFn: (c: { id: string; ref: string; date: string }) =>
      api.post(`/api/v1/admin/companion/authors/${c.id}/consent`, { consentRef: c.ref, consentDate: c.date }),
    onSuccess: () => { setConsent(null); refresh(); },
    onError: fail(setError),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/admin/companion/authors/${id}/consent/revoke`),
    onSuccess: refresh,
    onError: fail(setError),
  });

  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} />;
  const all = list.data ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {!editing && <Button onClick={() => setEditing({ id: null, displayName: "", bio: "" })}>+ معدّ جديد</Button>}
      </div>
      {error && <div className="mb-3"><Banner tone="warning" role="alert">{error}</Banner></div>}

      {editing && (
        <Card className="mb-4">
          <h2 className="mb-4 font-bold">{editing.id ? "تعديل التعريف" : "معدّ جديد"}</h2>
          {editing.id && <div className="mb-4"><Banner tone="warning">تعديل الاسم أو النبذة يُسقط الإذن المسجَّل، فتختفي خطط المعدّ حتى يُسجَّل إذن جديد بالنص الجديد.</Banner></div>}
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <Field label="الاسم كما وافق عليه المعدّ" htmlFor="a-name">
              <Input id="a-name" value={editing.displayName} maxLength={80} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} required />
            </Field>
            <Field label="النبذة (سطران) كما وافق عليها" htmlFor="a-bio">
              <Textarea id="a-bio" value={editing.bio} maxLength={300} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} required />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" busy={save.isPending}>حفظ</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
            </div>
          </form>
        </Card>
      )}

      {!all.length ? (
        <EmptyState title="لا معدّين بعد">أضف المعدّ بالاسم والنبذة كما وافق عليهما كتابةً، ثم سجّل مرجع إذنه.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {all.map((a) => (
            <li key={a.id}>
              <Card as="article">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{a.displayName}</h2>
                    <p className="text-sm text-muted">{a.bio}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.publishedPlans > 0 && <Badge tone="primary">{a.publishedPlans} منشورة</Badge>}
                    <Badge tone={a.hasConsent ? "success" : "warning"}>{a.hasConsent ? `إذن ${a.consentRef} — ${a.consentDate}` : "بلا إذن مسجَّل"}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!a.hasConsent && <Button onClick={() => setConsent({ id: a.id, ref: "", date: new Date().toISOString().slice(0, 10) })}>سجّل الإذن المكتوب</Button>}
                  {a.hasConsent && (
                    <Button variant="secondary" busy={revoke.isPending} onClick={() => window.confirm("سحب الإذن يُخفي كل خطط هذا المعدّ فوراً. متابعة؟") && revoke.mutate(a.id)}>
                      سحب الإذن
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setEditing({ id: a.id, displayName: a.displayName, bio: a.bio })}>تعديل التعريف</Button>
                </div>
                {consent?.id === a.id && (
                  <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); record.mutate(consent); }}>
                    <Field label="مرجع الإذن المكتوب" htmlFor={`c-ref-${a.id}`} hint="رقم أرشيف الوثيقة أو معرّف ملف الإذن المحفوظ لدى الإدارة.">
                      <Input id={`c-ref-${a.id}`} value={consent.ref} maxLength={100} onChange={(e) => setConsent({ ...consent, ref: e.target.value })} required />
                    </Field>
                    <Field label="تاريخ الإذن" htmlFor={`c-date-${a.id}`}>
                      <Input id={`c-date-${a.id}`} type="date" value={consent.date} onChange={(e) => setConsent({ ...consent, date: e.target.value })} required />
                    </Field>
                    <div className="flex gap-2 md:col-span-2">
                      <Button type="submit" busy={record.isPending}>تسجيل</Button>
                      <Button type="button" variant="ghost" onClick={() => setConsent(null)}>إلغاء</Button>
                    </div>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── الخطط ───────────────────────────────────────────────────────────────────

interface PlanForm {
  key: string; title: string; summary: string; contents: string; authorId: string; durationDays: number; minutesPerDay: number;
  /** أنماط الأيام: اليوم d يأخذ النمط ((d-1) % عدد الأنماط). */
  patterns: PlanItem[][];
}

const blankItem = (kind: ItemKind): PlanItem =>
  kind === "Quran" ? { kind, quranKey: "fatiha", title: "سورة الفاتحة", repeat: 1 }
  : kind === "Dhikr" ? { kind, title: "", text: "", source: "", note: "", repeat: 1 }
  : { kind, text: "", repeat: 1 };

const defaultNote: PlanItem = { kind: "Note", text: "اقرأ بتدبّر وطمأنينة. والرقية لا تعني ترك العلاج الموصوف لك.", repeat: 1 };

function PlansSection() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["companion-plans"], queryFn: () => api.get<AdminPlan[]>("/api/v1/admin/companion/plans") });
  const authors = useQuery({ queryKey: ["companion-authors"], queryFn: () => api.get<AdminAuthor[]>("/api/v1/admin/companion/authors") });
  const [editing, setEditing] = useState<{ id: string | null; form: PlanForm } | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; safety: Safety } | null>(null);
  const [returning, setReturning] = useState<{ id: string; reason: string; withdraw: boolean } | null>(null);
  const [filter, setFilter] = useState<PlanStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ["companion-plans"] });
    void qc.invalidateQueries({ queryKey: ["companion-authors"] });
  };

  const save = useMutation({
    mutationFn: (e: { id: string | null; form: PlanForm }) => {
      const { patterns, key, ...rest } = e.form;
      const body = { ...rest, days: daysFromPatterns(patterns, e.form.durationDays) };
      return e.id ? api.put(`/api/v1/admin/companion/plans/${e.id}`, body) : api.post("/api/v1/admin/companion/plans", { ...body, key });
    },
    onSuccess: () => { setEditing(null); refresh(); },
    onError: fail(setError),
  });
  const review = useMutation({
    mutationFn: (v: { id: string; action: "Submit" | "Approve" | "Return"; reason?: string; safety?: Safety }) =>
      api.post(`/api/v1/admin/companion/plans/${v.id}/review`, { action: v.action, reason: v.reason ?? null, safety: v.safety ?? null }),
    onSuccess: () => { setReviewing(null); setReturning(null); refresh(); },
    onError: fail(setError),
  });
  const version = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/admin/companion/plans/${id}/versions`),
    onSuccess: refresh,
    onError: fail(setError),
  });
  const withdraw = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`/api/v1/admin/companion/plans/${v.id}/withdraw`, { reason: v.reason }),
    onSuccess: () => { setReturning(null); refresh(); },
    onError: fail(setError),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/admin/companion/plans/${id}`),
    onSuccess: refresh,
    onError: fail(setError),
  });

  if (list.isLoading || authors.isLoading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} />;
  const all = list.data ?? [];
  const shown = filter === "all" ? all : all.filter((p) => p.status === filter);
  const pendingForMe = all.filter((p) => p.canReview).length;
  const authorList = authors.data ?? [];

  const newForm = (): PlanForm => ({
    key: "", title: "", summary: "", contents: "", authorId: authorList[0]?.id ?? "", durationDays: 7, minutesPerDay: 10,
    patterns: [[defaultNote, blankItem("Quran")]],
  });

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {!editing && (
          <Button disabled={!authorList.length} onClick={() => setEditing({ id: null, form: newForm() })}>
            + خطة جديدة
          </Button>
        )}
      </div>
      {!authorList.length && <Banner tone="lamp">أضف معدّاً أولاً من «المعدّون وأذونهم».</Banner>}
      {pendingForMe > 0 && (
        <Banner tone="lamp" title={`${pendingForMe} ${pendingForMe === 1 ? "خطة تنتظر" : "خطط تنتظر"} مراجعتك`}>
          راجع كل يوم من الورد، وتحقق من التخريج، ثم أقرّ بنود فحص الأمان بنداً بنداً.
        </Banner>
      )}
      {error && <div className="mt-3"><Banner tone="warning" role="alert">{error}</Banner></div>}

      {editing && (
        <PlanEditor
          initial={editing.form}
          isNew={!editing.id}
          authors={authorList}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(form) => save.mutate({ id: editing.id, form })}
        />
      )}

      <div className="mb-4 mt-6 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="الحالة">
        {(["all", "InReview", "Draft", "Published", "Superseded", "Withdrawn"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", filter === f ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
          >
            {f === "all" ? `الكل (${all.length})` : `${statusLabel[f].label} (${all.filter((p) => p.status === f).length})`}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <EmptyState title="لا خطط هنا">الخطة توصف بمحتواها ومدتها، لا بحالة المستخدم: «آيات الرقية مع أذكار الصباح والمساء، ٢١ يوماً».</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Card as="article">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{p.title}</h2>
                    <p className="text-xs text-muted">
                      {p.key} · الإصدار {p.version} · {p.durationDays} يوماً · نحو {p.minutesPerDay} دقيقة · إعداد {p.authorName} · {formatDateTime(p.createdAtUtc)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isMine && <Badge tone="primary">إعدادي</Badge>}
                    {!p.authorHasConsent && <Badge tone="warning">المعدّ بلا إذن</Badge>}
                    <Badge tone={statusLabel[p.status].tone}>{statusLabel[p.status].label}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm">{p.summary}</p>
                <p className="mt-1 text-sm text-muted">{p.contents}</p>
                <DaysPreview days={p.days} />
                {p.reviewNote && p.status === "Draft" && <div className="mt-3"><Banner tone="warning" title="ملاحظة المراجع">{p.reviewNote}</Banner></div>}
                {p.withdrawReason && p.status === "Withdrawn" && <div className="mt-3"><Banner tone="warning" title="سبب السحب">{p.withdrawReason}</Banner></div>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {p.status === "Draft" && p.isMine && (
                    <>
                      <Button busy={review.isPending} onClick={() => review.mutate({ id: p.id, action: "Submit" })}>أرسل للمراجعة</Button>
                      <Button variant="ghost" onClick={() => setEditing({ id: p.id, form: { ...p, patterns: patternsFromDays(p.days) } })}>تعديل</Button>
                      <Button variant="ghost" busy={remove.isPending} onClick={() => window.confirm("حذف المسودة نهائياً؟") && remove.mutate(p.id)}>حذف</Button>
                    </>
                  )}
                  {p.canReview && (
                    <>
                      <Button onClick={() => setReviewing({ id: p.id, safety: noChecks })}>راجعها</Button>
                      <Button variant="secondary" onClick={() => setReturning({ id: p.id, reason: "", withdraw: false })}>أعدها لمنشئها</Button>
                    </>
                  )}
                  {p.status === "Published" && (
                    <Button variant="secondary" busy={version.isPending} onClick={() => version.mutate(p.id)}>إصدار جديد للتعديل</Button>
                  )}
                  {(p.status === "Published" || p.status === "Superseded") && (
                    <Button variant="ghost" onClick={() => setReturning({ id: p.id, reason: "", withdraw: true })}>اسحبها من العرض</Button>
                  )}
                </div>
                {p.status === "InReview" && p.isMine && <p className="mt-2 text-xs text-muted">ينشرها مدير محتوى آخر بعد مراجعتها وفحص الأمان.</p>}

                {reviewing?.id === p.id && (
                  <form
                    className="mt-4 grid gap-2 rounded-xl border border-border p-4"
                    onSubmit={(e) => { e.preventDefault(); review.mutate({ id: p.id, action: "Approve", safety: reviewing.safety }); }}
                  >
                    <h3 className="font-bold">فحص الأمان قبل النشر</h3>
                    <p className="text-sm text-muted">أقرّ بكل بند بعد قراءة الخطة كاملة يوماً يوماً.</p>
                    {safetyChecks.map(([k, label]) => (
                      <Checkbox
                        key={k}
                        id={`s-${p.id}-${k}`}
                        label={label}
                        checked={reviewing.safety[k]}
                        onChange={(v) => setReviewing({ ...reviewing, safety: { ...reviewing.safety, [k]: v } })}
                      />
                    ))}
                    {!p.authorHasConsent && <Banner tone="warning">لا تُنشر قبل تسجيل إذن المعدّ المكتوب.</Banner>}
                    <div className="mt-2 flex gap-2">
                      <Button type="submit" busy={review.isPending} disabled={!Object.values(reviewing.safety).every(Boolean) || !p.authorHasConsent}>
                        راجعتها — انشر
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setReviewing(null)}>إلغاء</Button>
                    </div>
                  </form>
                )}

                {returning?.id === p.id && (
                  <form
                    className="mt-4 flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (returning.withdraw) withdraw.mutate({ id: p.id, reason: returning.reason });
                      else review.mutate({ id: p.id, action: "Return", reason: returning.reason });
                    }}
                  >
                    <Field label={returning.withdraw ? "سبب السحب (يُدقَّق)" : "السبب (يراه منشئ الخطة)"} htmlFor={`r-${p.id}`}>
                      <Textarea id={`r-${p.id}`} value={returning.reason} maxLength={returning.withdraw ? 300 : 500} onChange={(e) => setReturning({ ...returning, reason: e.target.value })} required />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" busy={review.isPending || withdraw.isPending}>تأكيد</Button>
                      <Button type="button" variant="ghost" onClick={() => setReturning(null)}>إلغاء</Button>
                    </div>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DaysPreview({ days }: { days: PlanDay[] }) {
  const patterns = patternsFromDays(days);
  return (
    <details className="mt-3 rounded-lg border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">
        الورد اليومي {patterns.length === 1 ? "(نفسه كل يوم)" : `(دورة من ${patterns.length} أيام)`}
      </summary>
      {patterns.map((items, i) => (
        <div key={i} className="mt-2">
          {patterns.length > 1 && <p className="text-xs font-semibold text-muted">النمط {i + 1}</p>}
          <ol className="list-decimal ps-5">
            {items.map((it, n) => (
              <li key={n}>
                {it.kind === "Quran"
                  ? `${it.title} — ${passages.find((x) => x.key === it.quranKey)?.label ?? it.quranKey}${it.repeat > 1 ? ` ×${it.repeat}` : ""}`
                  : it.kind === "Dhikr"
                    ? `${it.title} — ${it.source}${it.repeat > 1 ? ` ×${it.repeat}` : ""}`
                    : `توجيه: ${it.text}`}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </details>
  );
}

function PlanEditor({ initial, isNew, authors, busy, onSave, onCancel }: {
  initial: PlanForm; isNew: boolean; authors: AdminAuthor[]; busy: boolean; onSave: (f: PlanForm) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<PlanForm>(initial);
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (p: number, i: number, patch: Partial<PlanItem>) =>
    set("patterns", f.patterns.map((items, pi) => (pi !== p ? items : items.map((it, ii) => (ii === i ? { ...it, ...patch } : it)))));
  const addItem = (p: number, kind: ItemKind) => set("patterns", f.patterns.map((items, pi) => (pi === p ? [...items, blankItem(kind)] : items)));
  const removeItem = (p: number, i: number) => set("patterns", f.patterns.map((items, pi) => (pi === p ? items.filter((_, ii) => ii !== i) : items)));
  const move = (p: number, i: number, d: -1 | 1) =>
    set("patterns", f.patterns.map((items, pi) => {
      if (pi !== p || i + d < 0 || i + d >= items.length) return items;
      const next = [...items];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    }));

  return (
    <Card className="mt-4">
      <h2 className="mb-4 font-bold">{isNew ? "خطة جديدة" : "تعديل المسودة"}</h2>
      <Banner tone="neutral">
        النص القرآني لا يُكتب هنا: اختر المقطع من المصحف المدقّق المضمَّن في التطبيق. الأذكار تُكتب مشكولة مع تخريجها كاملاً.
        صِف الخطة بمحتواها ومدتها، لا بحالة المستخدم.
      </Banner>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        {isNew && (
          <Field label="المعرّف الثابت (لاتيني)" htmlFor="p-key" hint="يبقى عبر الإصدارات. مثال: ruqyah-ayat-21">
            <Input id="p-key" dir="ltr" value={f.key} pattern="[a-z0-9][a-z0-9-]{2,59}" onChange={(e) => set("key", e.target.value.toLowerCase())} required />
          </Field>
        )}
        <Field label="العنوان" htmlFor="p-title">
          <Input id="p-title" value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="الملخص (سطر)" htmlFor="p-sum">
          <Input id="p-sum" value={f.summary} maxLength={200} onChange={(e) => set("summary", e.target.value)} required />
        </Field>
        <Field label="المعدّ" htmlFor="p-author">
          <Select id="p-author" value={f.authorId} onChange={(e) => set("authorId", e.target.value)}>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.displayName}{a.hasConsent ? "" : " (بلا إذن بعد)"}</option>)}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="ما تحتويه الخطة يومياً" htmlFor="p-contents">
            <Textarea id="p-contents" value={f.contents} maxLength={600} onChange={(e) => set("contents", e.target.value)} required />
          </Field>
        </div>
        <Field label="المدة" htmlFor="p-dur">
          <Select id="p-dur" value={f.durationDays} onChange={(e) => set("durationDays", Number(e.target.value))}>
            {[7, 14, 21, 40].map((d) => <option key={d} value={d}>{d} يوماً</option>)}
          </Select>
        </Field>
        <Field label="مدة الورد اليومي (دقائق، تقديرية)" htmlFor="p-min">
          <Input id="p-min" type="number" min={1} max={120} value={f.minutesPerDay} onChange={(e) => set("minutesPerDay", Number(e.target.value) || 1)} className="num" />
        </Field>

        <div className="md:col-span-2">
          <h3 className="mb-1 font-bold">الورد اليومي</h3>
          <p className="mb-3 text-sm text-muted">
            نمط واحد يتكرر كل يوم، أو أكثر يتناوب: اليوم الأول بالنمط الأول، والثاني بالثاني، وهكذا ثم يعود.
          </p>
          {f.patterns.map((items, p) => (
            <div key={p} className="mb-4 rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-sm">{f.patterns.length > 1 ? `النمط ${p + 1}` : "ورد كل يوم"}</strong>
                {f.patterns.length > 1 && (
                  <Button type="button" variant="ghost" onClick={() => set("patterns", f.patterns.filter((_, i) => i !== p))}>حذف النمط</Button>
                )}
              </div>
              <ol className="grid gap-3">
                {items.map((it, i) => (
                  <li key={i} className="grid gap-2 rounded-lg bg-surface-2 p-3 md:grid-cols-6">
                    {it.kind === "Quran" && (
                      <>
                        <div className="md:col-span-2">
                          <Field label="المقطع" htmlFor={`q-${p}-${i}`}>
                            <Select id={`q-${p}-${i}`} value={it.quranKey ?? ""} onChange={(e) => {
                              const key = e.target.value as QuranKey;
                              setItem(p, i, { quranKey: key, title: it.title || quran[key].surahName });
                            }}>
                              {passages.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </Select>
                          </Field>
                        </div>
                        <div className="md:col-span-2">
                          <Field label="العنوان" htmlFor={`qt-${p}-${i}`}>
                            <Input id={`qt-${p}-${i}`} value={it.title ?? ""} maxLength={150} onChange={(e) => setItem(p, i, { title: e.target.value })} required />
                          </Field>
                        </div>
                      </>
                    )}
                    {it.kind === "Dhikr" && (
                      <>
                        <div className="md:col-span-2">
                          <Field label="عنوان الذكر" htmlFor={`dt-${p}-${i}`}>
                            <Input id={`dt-${p}-${i}`} value={it.title ?? ""} maxLength={150} onChange={(e) => setItem(p, i, { title: e.target.value })} required />
                          </Field>
                        </div>
                        <div className="md:col-span-2">
                          <Field label="التخريج" htmlFor={`ds-${p}-${i}`}>
                            <Input id={`ds-${p}-${i}`} value={it.source ?? ""} maxLength={300} onChange={(e) => setItem(p, i, { source: e.target.value })} required />
                          </Field>
                        </div>
                        <div className="md:col-span-6">
                          <Field label="نص الذكر (مشكولاً)" htmlFor={`dx-${p}-${i}`}>
                            <Textarea id={`dx-${p}-${i}`} value={it.text ?? ""} maxLength={3000} onChange={(e) => setItem(p, i, { text: e.target.value })} className="font-naskh text-lg" required />
                          </Field>
                        </div>
                      </>
                    )}
                    {it.kind === "Note" && (
                      <div className="md:col-span-4">
                        <Field label="توجيه المعدّ (قصير)" htmlFor={`n-${p}-${i}`}>
                          <Input id={`n-${p}-${i}`} value={it.text ?? ""} maxLength={300} onChange={(e) => setItem(p, i, { text: e.target.value })} required />
                        </Field>
                      </div>
                    )}
                    {it.kind !== "Note" && (
                      <Field label="التكرار" htmlFor={`r-${p}-${i}`}>
                        <Input id={`r-${p}-${i}`} type="number" min={1} max={1000} value={it.repeat} onChange={(e) => setItem(p, i, { repeat: Number(e.target.value) || 1 })} className="num" />
                      </Field>
                    )}
                    <div className="flex items-end gap-1">
                      <Button type="button" variant="ghost" aria-label="أعلى" onClick={() => move(p, i, -1)}>↑</Button>
                      <Button type="button" variant="ghost" aria-label="أسفل" onClick={() => move(p, i, 1)}>↓</Button>
                      <Button type="button" variant="ghost" onClick={() => removeItem(p, i)}>حذف</Button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => addItem(p, "Quran")}>+ مقطع قرآني</Button>
                <Button type="button" variant="secondary" onClick={() => addItem(p, "Dhikr")}>+ ذكر مخرَّج</Button>
                <Button type="button" variant="secondary" onClick={() => addItem(p, "Note")}>+ توجيه</Button>
              </div>
            </div>
          ))}
          {f.patterns.length < 7 && (
            <Button type="button" variant="ghost" onClick={() => set("patterns", [...f.patterns, [defaultNote, blankItem("Quran")]])}>+ نمط يوم آخر يتناوب</Button>
          )}
        </div>

        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" busy={busy}>حفظ مسودة</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </form>
    </Card>
  );
}

// ── المؤشرات المجمّعة ─────────────────────────────────────────────────────────

interface Stats {
  from: string; to: string; rows: { day: string; name: string; dimension: string; count: number }[];
  totals: Record<string, number>; publishedPlans: number; activeEnrollments: number; groupKhatmas: number;
}

const eventLabels: Record<string, string> = {
  first_open: "أول فتح",
  plan_started: "بدء خطة",
  wird_completed: "إتمام ورد يومي",
  plan_completed: "إتمام خطة",
  khatma_juz_done: "قراءة جزء",
  khatma_completed: "تمام ختمة",
  khatma_invite_accepted: "انضمام بدعوة",
};

export function CompanionStatsPage() {
  const [days, setDays] = useState(30);
  const stats = useQuery({ queryKey: ["companion-stats", days], queryFn: () => api.get<Stats>(`/api/v1/admin/companion/stats?days=${days}`) });
  if (stats.isLoading) return <Loading />;
  if (stats.error) return <ErrorState error={stats.error} />;
  const s = stats.data!;
  const byDim = (name: string) =>
    Object.entries(s.rows.filter((r) => r.name === name).reduce<Record<string, number>>((m, r) => ({ ...m, [r.dimension]: (m[r.dimension] ?? 0) + r.count }), {}));

  return (
    <div>
      <PageHeader
        title="مؤشرات تطبيق سند"
        subtitle="عدّادات يومية مجهولة تماماً: لا معرّف لمستخدم ولا جهاز ولا أي نص كتبه أحد. تفيد في معرفة أي المدد أكثر طلباً، وهل يصل الناس إلى صفحة الأمان."
        actions={
          <Select aria-label="المدة" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>آخر {d} يوماً</option>)}
          </Select>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[["خطط منشورة", s.publishedPlans], ["خطط نشطة لأصحاب الحسابات", s.activeEnrollments], ["ختمات جماعية", s.groupKhatmas]].map(([label, n]) => (
          <Card key={label as string}>
            <p className="text-sm text-muted">{label}</p>
            <p className="num text-2xl font-bold">{n}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <table className="w-full text-sm">
          <caption className="mb-2 text-start font-bold">من {s.from} إلى {s.to}</caption>
          <thead>
            <tr className="border-b border-border text-start text-muted">
              <th className="py-2 text-start font-semibold">الحدث</th>
              <th className="py-2 text-start font-semibold">المجموع</th>
              <th className="py-2 text-start font-semibold">التوزيع</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(eventLabels).map((name) => (
              <tr key={name} className="border-b border-border">
                <td className="py-2">{eventLabels[name]}</td>
                <td className="num py-2">{s.totals[name] ?? 0}</td>
                <td className="py-2 text-muted">{byDim(name).map(([d, n]) => `${d}: ${n}`).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
