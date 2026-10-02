import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, newIdempotencyKey } from "../../api/client";
import type { BookingCreated, ProviderPublic, Slot } from "@sanad/shared/api/types";
import { Banner, Button, Card, Checkbox, EmptyState, ErrorState, Field, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDay, formatTime } from "@sanad/shared/lib/format";

const MAX_NOTE = 2000;

/**
 * نموذج الحجز: اختيار خدمة وفترة، و"ملاحظتك للمختص" الاختيارية (مشفّرة، يراها المختص المُسنَد فقط).
 * الحقل الحساس بلا أي حركة زخرفية (13 §13.4). مفتاح Idempotency ثابت لكل محاولة إرسال.
 */
export function BookPage() {
  const { providerId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const idempotencyKey = useRef(newIdempotencyKey());

  const provider = useQuery({ queryKey: ["provider", providerId], queryFn: () => api.get<ProviderPublic>(`/api/v1/providers/${providerId}`) });
  const slots = useQuery({ queryKey: ["availability", providerId], queryFn: () => api.get<Slot[]>(`/api/v1/providers/${providerId}/availability`) });

  const [offeringId, setOfferingId] = useState(params.get("offering") ?? "");
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const day = formatDay(s.startUtc);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots.data]);

  const book = useMutation({
    mutationFn: () =>
      api.post<BookingCreated>(
        "/api/v1/bookings",
        { serviceOfferingId: offeringId, availabilitySlotId: slotId, beneficiaryNote: note.trim() || null, consentToSensitiveNoteProcessing: consent },
        { headers: { "Idempotency-Key": idempotencyKey.current } },
      ),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      navigate(`/bookings/${res.id}`, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.friendly : "تعذّر إرسال الطلب.");
      if (err instanceof ApiError && err.status === 409) {
        void slots.refetch();
        setSlotId("");
        idempotencyKey.current = newIdempotencyKey();
      }
    },
  });

  if (provider.isLoading || slots.isLoading) return <Loading />;
  if (provider.error || !provider.data) return <ErrorState error={provider.error ?? new Error("غير موجود")} />;

  const hasNote = note.trim().length > 0;
  const canSubmit = offeringId && slotId && (!hasNote || consent);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`حجز موعد مع ${provider.data.displayName}`} subtitle="الخدمة مجانية بالكامل. سيراجع المختص طلبك ويؤكده أو يقترح موعداً بديلاً." />
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          book.mutate();
        }}
      >
        <Card>
          <Field label="الخدمة" htmlFor="off">
            <Select id="off" value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
              <option value="">اختر خدمة</option>
              {provider.data.offerings.map((o) => (
                <option key={o.id} value={o.id}>{o.category} — {o.sessionDurationMinutes} دقيقة</option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">الموعد</h2>
          {slots.error ? (
            <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />
          ) : grouped.length === 0 ? (
            <EmptyState title="لا مواعيد متاحة حالياً">عُد لاحقاً — يضيف المختصون مواعيدهم دورياً.</EmptyState>
          ) : (
            <div className="grid gap-4" role="radiogroup" aria-label="المواعيد المتاحة">
              {grouped.map(([day, list]) => (
                <div key={day}>
                  <p className="mb-2 text-sm font-semibold text-muted">{day}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={slotId === s.id}
                        onClick={() => setSlotId(s.id)}
                        className={cx("num rounded-xl border px-4 py-2 text-sm", slotId === s.id ? "border-primary bg-primary text-primary-contrast" : "border-border bg-surface hover:border-primary")}
                      >
                        {formatTime(s.startUtc)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <Field
            label="ملاحظتك للمختص (اختيارية)"
            htmlFor="note"
            hint={<>تُحفظ مشفّرة، ولا يراها إلا المختص المُسنَد لهذا الحجز. <span className="num">{note.length}/{MAX_NOTE}</span></>}
          >
            <Textarea id="note" maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ما الذي تودّ أن يعرفه المختص قبل الموعد؟" />
          </Field>
          {hasNote && (
            <div className="mt-3">
              <Checkbox
                id="consent"
                checked={consent}
                onChange={setConsent}
                label="أوافق على معالجة هذه الملاحظة الحساسة (تُشفَّر ولا يطّلع عليها إلا المختص المُسنَد، أو فريق التنسيق عند وجود خطر)."
              />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">إن كنت في خطر الآن فلا تنتظر الموعد — صفحة الطوارئ متاحة من أعلى كل صفحة.</p>
        </Card>

        {error && <Banner tone="danger" role="alert">{error}</Banner>}
        <div className="flex gap-3">
          <Button type="submit" busy={book.isPending} disabled={!canSubmit}>إرسال طلب الحجز</Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>رجوع</Button>
        </div>
      </form>
    </div>
  );
}
