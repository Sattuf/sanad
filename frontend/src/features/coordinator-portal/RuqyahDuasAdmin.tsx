import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { useMe } from "../../api/hooks";
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "@sanad/shared/lib/format";
import { collections } from "@sanad/shared/content/ruqyah";

/*
  الأدعية المكتوبة: يكتب مدير المحتوى الدعاء بتخريجه (مسودة)، ثم يرسله للمراجعة، فيراجعه مدير محتوى آخر
  وينشره أو يعيده بسبب مكتوب. أي تعديل بعد النشر يعيده مسودة. الخادم يفرض كل ذلك؛ الواجهة تعكسه فقط.
*/

type Status = "Draft" | "InReview" | "Published";

interface AdminDua {
  id: string; collectionId: string; title: string; text: string; source: string; note: string | null; repeat: number; sortOrder: number;
  status: Status; isMine: boolean; canReview: boolean; reviewNote: string | null; publishedAtUtc: string | null; createdAtUtc: string;
}

interface Form { collectionId: string; title: string; text: string; source: string; note: string; repeat: number; sortOrder: number }

const empty: Form = { collectionId: collections[0].id, title: "", text: "", source: "", note: "", repeat: 1, sortOrder: 100 };

const statusLabel: Record<Status, { label: string; tone: "neutral" | "lamp" | "success" }> = {
  Draft: { label: "مسودة", tone: "neutral" },
  InReview: { label: "بانتظار المراجعة", tone: "lamp" },
  Published: { label: "منشور", tone: "success" },
};

const collectionTitle = (id: string) => collections.find((c) => c.id === id)?.title ?? id;

export function RuqyahDuasAdminPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-duas"], queryFn: () => api.get<AdminDua[]>("/api/v1/admin/ruqyah/duas") });
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState<{ id: string; reason: string } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-duas"] });
    void qc.invalidateQueries({ queryKey: ["ruqyah-duas"] });
  };
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.friendly : "تعذّر التنفيذ.");

  const save = useMutation({
    mutationFn: (e: { id: string | null; form: Form }) => {
      const body = { ...e.form, note: e.form.note.trim() || null };
      return e.id ? api.put<AdminDua>(`/api/v1/admin/ruqyah/duas/${e.id}`, body) : api.post<AdminDua>("/api/v1/admin/ruqyah/duas", body);
    },
    onSuccess: () => { setEditing(null); setError(null); refresh(); },
    onError: fail,
  });
  const review = useMutation({
    mutationFn: (v: { id: string; action: "Submit" | "Approve" | "Return"; reason?: string }) =>
      api.post<AdminDua>(`/api/v1/admin/ruqyah/duas/${v.id}/review`, { action: v.action, reason: v.reason ?? null }),
    onSuccess: () => { setReturning(null); setError(null); refresh(); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/admin/ruqyah/duas/${id}`),
    onSuccess: refresh,
    onError: fail,
  });

  if (!me) return <Loading />;
  if (!me.roles.includes("ContentManager"))
    return <Banner tone="warning" title="لمدير المحتوى فقط">إضافة الأدعية ومراجعتها من صلاحية «مدير المحتوى».</Banner>;
  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} />;

  const all = list.data ?? [];
  const shown = filter === "all" ? all : all.filter((d) => d.status === filter);
  const pendingForMe = all.filter((d) => d.canReview).length;

  return (
    <div>
      <PageHeader
        title="الأدعية المكتوبة"
        subtitle="تُضاف إلى مجموعات «الرقية والتحصين» بعد مراجعة شرعية من مدير محتوى آخر غير الكاتب. اكتب النص مشكولاً مع تخريجه كاملاً."
        actions={!editing && <Button onClick={() => setEditing({ id: null, form: empty })}>+ دعاء جديد</Button>}
      />

      {pendingForMe > 0 && (
        <Banner tone="lamp" title={`${pendingForMe} ${pendingForMe === 1 ? "دعاء ينتظر" : "أدعية تنتظر"} مراجعتك`}>
          راجع النص حرفاً حرفاً وتحقق من التخريج قبل النشر.
        </Banner>
      )}
      {error && <div className="mt-3"><Banner tone="warning" role="alert">{error}</Banner></div>}

      {editing && (
        <DuaEditor
          initial={editing.form}
          isNew={!editing.id}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(form) => save.mutate({ id: editing.id, form })}
        />
      )}

      <div className="mb-4 mt-6 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="الحالة">
        {(["all", "InReview", "Draft", "Published"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", filter === f ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
          >
            {f === "all" ? `الكل (${all.length})` : `${statusLabel[f].label} (${all.filter((d) => d.status === f).length})`}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <EmptyState title="لا أدعية هنا">النصوص الأساسية ثابتة في الموقع؛ ما تضيفه هنا يظهر بعدها في المجموعة المختارة.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {shown.map((d) => (
            <li key={d.id}>
              <Card as="article">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{d.title}</h2>
                    <p className="text-xs text-muted">{collectionTitle(d.collectionId)} · ترتيب {d.sortOrder} · {d.repeat > 1 ? `يُكرَّر ${d.repeat}` : "مرة واحدة"} · {formatDateTime(d.createdAtUtc)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.isMine && <Badge tone="primary">كتابتي</Badge>}
                    <Badge tone={statusLabel[d.status].tone}>{statusLabel[d.status].label}</Badge>
                  </div>
                </div>
                <p className="mt-3 font-naskh text-xl leading-[2.1]">{d.text}</p>
                <p className="mt-2 text-sm font-semibold text-primary">{d.source}</p>
                {d.note && <p className="mt-1 text-sm text-muted">{d.note}</p>}
                {d.reviewNote && d.status === "Draft" && <div className="mt-3"><Banner tone="warning" title="ملاحظة المراجع">{d.reviewNote}</Banner></div>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {d.status === "Draft" && d.isMine && <Button busy={review.isPending} onClick={() => review.mutate({ id: d.id, action: "Submit" })}>أرسل للمراجعة</Button>}
                  {d.canReview && <Button busy={review.isPending} onClick={() => review.mutate({ id: d.id, action: "Approve" })}>راجعته — انشر</Button>}
                  {d.status !== "Draft" && (d.canReview || d.status === "Published") && (
                    <Button variant="secondary" onClick={() => setReturning({ id: d.id, reason: "" })}>{d.status === "Published" ? "سحب إلى المسودة" : "أعده للكاتب"}</Button>
                  )}
                  <Button variant="ghost" onClick={() => setEditing({ id: d.id, form: { ...d, note: d.note ?? "" } })}>تعديل</Button>
                  {d.status !== "Published" && (
                    <Button variant="ghost" busy={remove.isPending} onClick={() => { if (window.confirm("حذف هذا الدعاء نهائياً؟")) remove.mutate(d.id); }}>حذف</Button>
                  )}
                </div>
                {d.status === "InReview" && d.isMine && <p className="mt-2 text-xs text-muted">ينشره مدير محتوى آخر بعد مراجعته.</p>}

                {returning?.id === d.id && (
                  <form
                    className="mt-4 flex flex-col gap-2"
                    onSubmit={(e) => { e.preventDefault(); review.mutate({ id: d.id, action: "Return", reason: returning.reason }); }}
                  >
                    <Field label="السبب (يراه الكاتب)" htmlFor={`reason-${d.id}`}>
                      <Textarea id={`reason-${d.id}`} value={returning.reason} maxLength={500} onChange={(e) => setReturning({ id: d.id, reason: e.target.value })} required />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" busy={review.isPending}>تأكيد</Button>
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

function DuaEditor({ initial, isNew, busy, onSave, onCancel }: {
  initial: Form; isNew: boolean; busy: boolean; onSave: (f: Form) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Card className="mt-4">
      <h2 className="mb-4 font-bold">{isNew ? "دعاء جديد" : "تعديل الدعاء"}</h2>
      {!isNew && <div className="mb-4"><Banner tone="warning">حفظ أي تعديل يعيد الدعاء مسودة ويسحبه من العرض حتى تُعاد مراجعته.</Banner></div>}
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="المجموعة" htmlFor="d-col">
          <Select id="d-col" value={f.collectionId} onChange={(e) => set("collectionId", e.target.value)}>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="العنوان" htmlFor="d-title">
          <Input id="d-title" value={f.title} maxLength={150} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <div className="md:col-span-2">
          <Field label="نص الدعاء (مشكولاً)" htmlFor="d-text">
            <Textarea id="d-text" value={f.text} maxLength={3000} onChange={(e) => set("text", e.target.value)} className="font-naskh text-xl leading-[2.1]" required />
          </Field>
        </div>
        <Field label="التخريج" htmlFor="d-src" hint="مثال: رواه البخاري (6369)، أو: رواه أبو داود (5090) وحسّنه الألباني.">
          <Input id="d-src" value={f.source} maxLength={300} onChange={(e) => set("source", e.target.value)} required />
        </Field>
        <Field label="فائدة أو وقت القول (اختياري)" htmlFor="d-note">
          <Input id="d-note" value={f.note} maxLength={1000} onChange={(e) => set("note", e.target.value)} />
        </Field>
        <Field label="عدد التكرار" htmlFor="d-rep">
          <Input id="d-rep" type="number" min={1} max={1000} value={f.repeat} onChange={(e) => set("repeat", Number(e.target.value) || 1)} className="num" />
        </Field>
        <Field label="ترتيب العرض" htmlFor="d-order" hint="الأصغر يظهر أولاً بعد النصوص الثابتة.">
          <Input id="d-order" type="number" min={0} max={10000} value={f.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} className="num" />
        </Field>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" busy={busy}>حفظ مسودة</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </form>
    </Card>
  );
}
