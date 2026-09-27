import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import type { AudioTrack, CaseNote, Recommendation } from "../../api/types";
import { Banner, Button, Card, Field, Loading, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/format";

/*
  ════════════════════════════════════════════════════════════════════════════
  محرّران منفصلان تماماً بصرياً وبنيوياً (references/10-frontend-architecture.md §10.6):
  - CaseNoteEditor: شريط أحمر داكن ثابت — "لن يراها المستفيد أبداً".
  - RecommendationComposer: شريط أخضر ثابت — "سترسَل مباشرة للمستفيد".
  لا مكوّن يجمعهما، ولا حركة زخرفية في أيٍّ منهما (13 §13.4).
  ════════════════════════════════════════════════════════════════════════════
*/

export function CaseNoteEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const notes = useQuery({ queryKey: ["case-notes", id], queryFn: () => api.get<CaseNote[]>(`/api/v1/bookings/${id}/provider-note`) });
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/bookings/${id}/provider-note`, { text: text.trim() }),
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["case-notes", id] }); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الحفظ."),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div role="note" className="sticky top-16 z-10 mb-4 rounded-xl border-2 border-private bg-private-bg px-4 py-3 text-private">
        <p className="font-bold">ملاحظة إشرافية خاصة — لن يراها المستفيد أبداً تحت أي ظرف</p>
        <p className="text-sm">يطّلع عليها المشرف السريري، أو المنسق عند تصعيد موثّق فقط. لتوجيه المستفيد استخدم «إرسال توصية».</p>
      </div>
      <Link to={`/provider/bookings/${id}`} className="text-sm text-muted">→ العودة للحجز</Link>
      <Card className="mt-3">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
          <Field label="الملاحظة" htmlFor="cn" hint="نص حر مشفّر. لا تصنيف آلي لحالة المستفيد. نفس فلتر الادعاءات يسري هنا أيضاً.">
            <Textarea id="cn" className="min-h-40" maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {error && <Banner tone="danger" role="alert">{error}</Banner>}
          <div><Button type="submit" busy={save.isPending} disabled={!text.trim()}>حفظ الملاحظة الخاصة</Button></div>
        </form>
      </Card>
      <h2 className="mb-2 mt-6 font-bold">ملاحظاتي السابقة على هذا الحجز</h2>
      {notes.isLoading ? <Loading /> : (
        <ul className="grid gap-2">
          {(notes.data ?? []).map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="num text-xs text-muted">{formatDateTime(n.recordedAtUtc)}</p>
              <p className="mt-1 whitespace-pre-line leading-7">{n.note}</p>
            </li>
          ))}
          {notes.data?.length === 0 && <li className="text-muted">لا ملاحظات بعد.</li>}
        </ul>
      )}
    </div>
  );
}

export function RecommendationComposer() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // اختيار من المكتبة المنشورة فقط — لا رفع جديد هنا
  const library = useQuery({ queryKey: ["library", "", ""], queryFn: () => api.get<AudioTrack[]>("/api/v1/library") });
  const history = useQuery({ queryKey: ["sent-recs", id], queryFn: () => api.get<Recommendation[]>(`/api/v1/bookings/${id}/recommendations`) });
  const send = useMutation({
    mutationFn: () => api.post(`/api/v1/bookings/${id}/recommendations`, { guidanceText: text.trim(), recommendedAudioTrackIds: selected }),
    onSuccess: () => { setText(""); setSelected([]); setSent(true); void qc.invalidateQueries({ queryKey: ["sent-recs", id] }); },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الإرسال."),
  });
  const toggle = (trackId: string) =>
    setSelected((s) => (s.includes(trackId) ? s.filter((x) => x !== trackId) : s.length >= 10 ? s : [...s, trackId]));

  return (
    <div className="mx-auto max-w-3xl">
      <div role="note" className="sticky top-16 z-10 mb-4 rounded-xl border-2 border-success bg-success-bg px-4 py-3 text-success">
        <p className="font-bold">هذه التوصية سترسَل مباشرة للمستفيد الآن</p>
        <p className="text-sm">توجيه عام أو مقاطع للاستماع — لا جرعات ولا وصفات دوائية ولا وعد بشفاء، حتى لو كنت طبيباً مرخّصاً. الوصفات مكانها القناة الطبية الرسمية.</p>
      </div>
      <Link to={`/provider/bookings/${id}`} className="text-sm text-muted">→ العودة للحجز</Link>
      <Card className="mt-3">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); setSent(false); send.mutate(); }}>
          <Field label="توجيهك للمستفيد" htmlFor="gt">
            <Textarea id="gt" className="min-h-36" maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب توجيهك للمستفيد..." />
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold">مقاطع مقترحة من المكتبة المنشورة (اختياري، حتى 10)</legend>
            {library.isLoading ? <Loading /> : (
              <div className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {(library.data ?? []).map((t) => (
                  <label key={t.id} className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", selected.includes(t.id) && "bg-surface-2")}>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                    <span>{t.title} <span className="text-xs text-muted">— {t.sourceLabel}</span></span>
                  </label>
                ))}
                {library.data?.length === 0 && <p className="px-3 py-2 text-sm text-muted">لا مقاطع منشورة بعد.</p>}
              </div>
            )}
          </fieldset>
          {error && <Banner tone="danger" role="alert">{error}</Banner>}
          {sent && <Banner tone="success">أُرسلت التوصية، وسيصل للمستفيد إشعار عام بوجودها.</Banner>}
          <div><Button type="submit" busy={send.isPending} disabled={!text.trim()}>إرسال للمستفيد</Button></div>
        </form>
      </Card>
      <h2 className="mb-2 mt-6 font-bold">ما أرسلته سابقاً لهذا المستفيد</h2>
      <ul className="grid gap-2">
        {(history.data ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="num text-xs text-muted">{formatDateTime(r.recordedAtUtc)} {r.acknowledgedAtUtc && "· اطّلع عليها"}</p>
            <p className="mt-1 whitespace-pre-line leading-7">{r.guidanceText}</p>
          </li>
        ))}
        {history.data?.length === 0 && <li className="text-muted">لا توصيات مرسلة بعد.</li>}
      </ul>
    </div>
  );
}
