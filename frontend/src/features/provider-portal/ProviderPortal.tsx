import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import type { BookingNote, BookingSummary, Conversation, DeliveryMode, MyProviderProfile, ServiceOffering, Slot } from "@sanad/shared/api/types";
import { VerificationBadge } from "../../components/safety";
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime, formatDay, formatTime, localInputToIso } from "@sanad/shared/lib/format";
import { statusTone } from "@sanad/shared/lib/status";

const useProfile = () => useQuery({ queryKey: ["my-provider-profile"], queryFn: () => api.get<MyProviderProfile>("/api/v1/me/provider-profile") });

export function ProviderPortalLayout() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cx("rounded-lg px-3 py-2 text-sm font-semibold", isActive ? "bg-surface-2 text-primary" : "text-muted hover:text-text");
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2" aria-label="بوابة المختص">
        <NavLink end to="/provider" className={tab}>الملف المهني</NavLink>
        <NavLink to="/provider/offerings" className={tab}>الخدمات</NavLink>
        <NavLink to="/provider/slots" className={tab}>المواعيد</NavLink>
        <NavLink to="/provider/bookings" className={tab}>الحجوزات</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export function ProviderProfilePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error } = useProfile();
  const [form, setForm] = useState({ displayName: "", declaredTitle: "", practiceScope: "", languages: "ar", deliveryMode: "Remote" as DeliveryMode, city: "", professionalBoundariesNote: "" });
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (data)
      setForm({
        displayName: data.displayName, declaredTitle: data.declaredTitle, practiceScope: data.practiceScope, languages: data.languages.join("، ") || "ar",
        deliveryMode: data.deliveryMode, city: data.city ?? "", professionalBoundariesNote: data.professionalBoundariesNote,
      });
  }, [data]);

  const onError = (err: unknown) => setMsg({ tone: "danger", text: err instanceof ApiError ? err.friendly : "تعذّر الحفظ." });
  const save = useMutation({
    mutationFn: () =>
      api.put("/api/v1/me/provider-profile", {
        ...form,
        city: form.city.trim() || null,
        languages: form.languages.split(/[,،]/).map((l) => l.trim()).filter(Boolean),
      }),
    onSuccess: () => { setMsg({ tone: "success", text: "حُفظ الملف." }); void qc.invalidateQueries({ queryKey: ["my-provider-profile"] }); },
    onError,
  });
  const publish = useMutation({
    mutationFn: () => api.post("/api/v1/me/provider-profile/publish"),
    onSuccess: () => { setMsg({ tone: "success", text: "نُشر ملفك في الدليل." }); void qc.invalidateQueries({ queryKey: ["my-provider-profile"] }); },
    onError,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error ?? new Error("لا يوجد ملف")} />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <PageHeader title="الملف المهني" subtitle="كل نص هنا يمر على فلتر الادعاءات قبل الحفظ: لا وعد بشفاء، لا ضمان نتيجة." />
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setMsg(null); save.mutate(); }}>
          <Field label="الاسم الظاهر" htmlFor="pdn"><Input id="pdn" value={form.displayName} onChange={set("displayName")} maxLength={150} /></Field>
          <Field label="اللقب المهني" htmlFor="pdt"><Input id="pdt" value={form.declaredTitle} onChange={set("declaredTitle")} maxLength={200} /></Field>
          <Field label="نطاق الممارسة" htmlFor="pps"><Textarea id="pps" value={form.practiceScope} onChange={set("practiceScope")} maxLength={2000} /></Field>
          <Field label="حدود الممارسة المهنية" htmlFor="pbn" hint="ما لا تقدّمه عبر المنصة، ومتى تحيل لجهة أخرى."><Textarea id="pbn" value={form.professionalBoundariesNote} onChange={set("professionalBoundariesNote")} maxLength={1000} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="اللغات" htmlFor="pl" hint="افصل بفاصلة"><Input id="pl" value={form.languages} onChange={set("languages")} /></Field>
            <Field label="طريقة التقديم" htmlFor="pdm">
              <Select id="pdm" value={form.deliveryMode} onChange={set("deliveryMode")}>
                {(["Remote", "InPerson", "Both"] as const).map((m) => <option key={m} value={m}>{t(`deliveryMode.${m}`)}</option>)}
              </Select>
            </Field>
            <Field label="المدينة" htmlFor="pc"><Input id="pc" value={form.city} onChange={set("city")} maxLength={100} /></Field>
          </div>
          {msg && <Banner tone={msg.tone} role="alert">{msg.text}</Banner>}
          <div><Button type="submit" busy={save.isPending}>حفظ</Button></div>
        </form>
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <h2 className="font-bold">حالة الملف</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={data.status === "Published" ? "success" : data.status === "Suspended" ? "danger" : "neutral"}>{t(`publication.${data.status}`)}</Badge>
            <Badge tone="primary">{t(`practitionerType.${data.practitionerType}`)}</Badge>
          </div>
          <div className="mt-3"><VerificationBadge verification={data.verification} /></div>
          {data.verification.expiresAtUtc && <p className="mt-2 text-sm text-muted">ينتهي التوثيق: <span className="num">{formatDateTime(data.verification.expiresAtUtc)}</span></p>}
          {data.suspensionReasonCode && <p className="mt-2 text-sm text-danger">سبب التعليق: {data.suspensionReasonCode}</p>}
          {data.status !== "Published" && data.status !== "Suspended" && (
            <Button className="mt-4 w-full" busy={publish.isPending} disabled={!data.isProfileComplete} onClick={() => publish.mutate()}>
              نشر في الدليل
            </Button>
          )}
          {!data.isProfileComplete && <p className="mt-2 text-xs text-muted">أكمل نطاق الممارسة وحدودها واللغات أولاً.</p>}
        </Card>
      </div>
    </div>
  );
}

export function OfferingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useProfile();
  const [form, setForm] = useState({ category: "", description: "", cancellationPolicy: "الإلغاء متاح قبل 24 ساعة من الموعد.", exclusions: "لا وعد بنتيجة، لا تشخيص", sessionDurationMinutes: 45 });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<ServiceOffering>("/api/v1/me/provider-profile/offerings", {
      ...form, explicitExclusions: form.exclusions.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { setForm((f) => ({ ...f, category: "", description: "" })); void qc.invalidateQueries({ queryKey: ["my-provider-profile"] }); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الحفظ."),
  });
  const toggle = useMutation({
    mutationFn: (o: ServiceOffering) => api.put(`/api/v1/me/provider-profile/offerings/${o.id}`, { ...o, isActive: !o.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-provider-profile"] }),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 text-xl font-bold">خدماتي</h2>
        {data.offerings.length === 0 ? <EmptyState title="لا خدمات بعد" /> : (
          <ul className="grid gap-3">
            {data.offerings.map((o) => (
              <li key={o.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{o.category}</p>
                    <Badge tone={o.isActive ? "success" : "neutral"}>{o.isActive ? "فعّالة" : "موقوفة"}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7">{o.description}</p>
                  <Button variant="ghost" className="mt-2" onClick={() => toggle.mutate(o)}>{o.isActive ? "إيقاف" : "تفعيل"}</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Card>
        <h2 className="font-bold">خدمة جديدة</h2>
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
          <Field label="الفئة" htmlFor="oc"><Input id="oc" value={form.category} maxLength={100} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="الوصف" htmlFor="od" hint="صف الخدمة ونطاقها فقط — لا حالة المستفيد، ولا وعد بنتيجة."><Textarea id="od" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="سياسة الإلغاء" htmlFor="ocp"><Input id="ocp" value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} /></Field>
          <Field label="ما لا تشمله الخدمة" htmlFor="oe" hint="افصل بفاصلة"><Input id="oe" value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} /></Field>
          <Field label="مدة الجلسة (دقائق)" htmlFor="om"><Input id="om" type="number" min={10} max={240} value={form.sessionDurationMinutes} onChange={(e) => setForm({ ...form, sessionDurationMinutes: Number(e.target.value) })} /></Field>
          {error && <Banner tone="danger" role="alert">{error}</Banner>}
          <div><Button type="submit" busy={create.isPending} disabled={!form.category.trim() || !form.description.trim()}>إضافة</Button></div>
        </form>
      </Card>
    </div>
  );
}

export function SlotsPage() {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["my-slots"], queryFn: () => api.get<Slot[]>("/api/v1/me/provider-profile/slots") });
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => {
      const startUtc = localInputToIso(start);
      const endUtc = new Date(new Date(startUtc).getTime() + minutes * 60_000).toISOString();
      return api.post<Slot>("/api/v1/me/provider-profile/slots", { startUtc, endUtc });
    },
    onSuccess: () => { setStart(""); void qc.invalidateQueries({ queryKey: ["my-slots"] }); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الإضافة."),
  });
  const cancel = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/me/provider-profile/slots/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["my-slots"] }) });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Card>
        <h2 className="font-bold">إضافة موعد متاح</h2>
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}>
          <Field label="البداية (بتوقيتك المحلي)" htmlFor="ss"><Input id="ss" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="المدة (دقائق)" htmlFor="sm"><Input id="sm" type="number" min={10} max={480} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          {error && <Banner tone="danger" role="alert">{error}</Banner>}
          <div><Button type="submit" busy={add.isPending} disabled={!start}>إضافة</Button></div>
        </form>
      </Card>
      <div>
        <h2 className="mb-3 text-xl font-bold">مواعيدي</h2>
        {slots.isLoading ? <Loading /> : !slots.data?.length ? <EmptyState title="لا مواعيد بعد" /> : (
          <ul className="grid gap-2">
            {slots.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                <span>{formatDay(s.startUtc)} — <span className="num">{formatTime(s.startUtc)}–{formatTime(s.endUtc)}</span></span>
                <div className="flex items-center gap-2">
                  <Badge tone={s.status === "Open" ? "success" : "lamp"}>{s.status === "Open" ? "متاح" : s.status === "Held" ? "محجوز مبدئياً" : "مؤكَّد"}</Badge>
                  {s.status === "Open" && <Button variant="ghost" onClick={() => cancel.mutate(s.id)}>حذف</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProviderBookingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({ queryKey: ["bookings", "provider"], queryFn: () => api.get<BookingSummary[]>("/api/v1/me/provider-profile/bookings") });
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return !data?.length ? <EmptyState title="لا حجوزات بعد" /> : (
    <ul className="grid gap-3">
      {data.map((b) => (
        <li key={b.id}>
          <Link to={`/provider/bookings/${b.id}`}>
            <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-primary">
              <div>
                <p className="font-bold">{b.counterpartDisplayName ?? "مستفيد"}</p>
                <p className="text-sm text-muted">{b.serviceCategory} — <span className="num">{formatDateTime(b.slotStartUtc)}</span></p>
              </div>
              <Badge tone={statusTone(b.status)}>{t(`bookingStatus.${b.status}`)}</Badge>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * مساحة عمل الحجز للمختص: الحالة والأفعال وملاحظة المستفيد.
 * الملاحظة الخاصة والتوصية لهما **رابطان منفصلان وصفحتان منفصلتان** — لا يجتمع المحرران في شاشة أو زر واحد (10 §10.6).
 */
export function ProviderBookingWorkspace() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [altSlot, setAltSlot] = useState("");
  const navigate = useNavigate();
  const booking = useQuery({ queryKey: ["bookings", id], queryFn: () => api.get<BookingSummary>(`/api/v1/bookings/${id}`) });
  const note = useQuery({ queryKey: ["booking-note", id], queryFn: () => api.get<BookingNote>(`/api/v1/bookings/${id}/note`) });
  const slots = useQuery({ queryKey: ["my-slots"], queryFn: () => api.get<Slot[]>("/api/v1/me/provider-profile/slots") });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ.");
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["bookings"] }); void qc.invalidateQueries({ queryKey: ["my-slots"] }); };

  const act = useMutation({ mutationFn: (a: "accept" | "cancel" | "complete") => api.post(`/api/v1/bookings/${id}/${a}`), onSuccess: refresh, onError });
  const reject = useMutation({ mutationFn: () => api.post(`/api/v1/bookings/${id}/reject`, { administrativeReason: reason }), onSuccess: refresh, onError });
  const propose = useMutation({ mutationFn: () => api.post(`/api/v1/bookings/${id}/propose-alternative`, { alternativeSlotId: altSlot }), onSuccess: refresh, onError });
  const chat = useMutation({ mutationFn: () => api.post<Conversation>(`/api/v1/bookings/${id}/conversation`), onSuccess: (c) => navigate(`/conversations/${c.id}`), onError });

  if (booking.isLoading) return <Loading />;
  if (booking.error || !booking.data) return <ErrorState error={booking.error ?? new Error("غير موجود")} />;
  const b = booking.data;
  const accepted = b.status === "Accepted" || b.status === "AdministrativelyCompleted";

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="grid content-start gap-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold">{b.counterpartDisplayName ?? "مستفيد"}</h1>
              <p className="text-sm text-muted">{b.serviceCategory} — <span className="num">{formatDateTime(b.slotStartUtc)}</span></p>
            </div>
            <Badge tone={statusTone(b.status)}>{t(`bookingStatus.${b.status}`)}</Badge>
          </div>
          {error && <div className="mt-3"><Banner tone="danger" role="alert">{error}</Banner></div>}
          {b.status === "UnderReview" && (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Button busy={act.isPending} onClick={() => act.mutate("accept")}>قبول</Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="اقتراح موعد بديل" htmlFor="alt">
                  <Select id="alt" value={altSlot} onChange={(e) => setAltSlot(e.target.value)}>
                    <option value="">اختر فترة متاحة</option>
                    {(slots.data ?? []).filter((s) => s.status === "Open").map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.startUtc)}</option>)}
                  </Select>
                </Field>
                <Button variant="secondary" disabled={!altSlot} busy={propose.isPending} onClick={() => propose.mutate()}>اقتراح</Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="رفض إداري (سبب مختصر)" htmlFor="rr"><Input id="rr" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
                <Button variant="ghost" disabled={!reason.trim()} busy={reject.isPending} onClick={() => reject.mutate()}>رفض</Button>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {b.status !== "Cancelled" && b.status !== "Rejected" && <Button variant="secondary" busy={chat.isPending} onClick={() => chat.mutate()}>المحادثة الإدارية</Button>}
            {b.status === "Accepted" && new Date(b.slotEndUtc) < new Date() && <Button variant="secondary" onClick={() => act.mutate("complete")}>إغلاق إداري</Button>}
            {(b.status === "Accepted" || b.status === "AlternativeProposed") && <Button variant="ghost" onClick={() => window.confirm("إلغاء الحجز؟") && act.mutate("cancel")}>إلغاء</Button>}
          </div>
        </Card>
        <Card>
          <h2 className="font-bold">ملاحظة المستفيد لك</h2>
          <p className="mt-1 text-xs text-muted">كتبها المستفيد عند الحجز — مشفّرة، وقراءتك لها مُسجَّلة في التدقيق.</p>
          <p className="mt-3 whitespace-pre-line leading-8">{note.data?.note ?? <span className="text-muted">لم يكتب ملاحظة.</span>}</p>
        </Card>
      </div>
      {accepted && (
        <nav className="grid content-start gap-3" aria-label="أدوات ما بعد القبول">
          <Link to={`/provider/bookings/${b.id}/recommend`} className="rounded-2xl border-2 border-success bg-success-bg p-4 text-success">
            <p className="font-bold">إرسال توصية للمستفيد</p>
            <p className="mt-1 text-sm">تصل للمستفيد مباشرة.</p>
          </Link>
          <div className="h-6" aria-hidden />
          <Link to={`/provider/bookings/${b.id}/private-note`} className="rounded-2xl border-2 border-private bg-private-bg p-4 text-private">
            <p className="font-bold">ملاحظة إشرافية خاصة</p>
            <p className="mt-1 text-sm">لن يراها المستفيد أبداً.</p>
          </Link>
        </nav>
      )}
    </div>
  );
}
