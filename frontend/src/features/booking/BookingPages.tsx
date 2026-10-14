import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { useMe } from "../../api/hooks";
import type { BookingNote, BookingSummary, Conversation } from "@sanad/shared/api/types";
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Loading, PageHeader } from "../../components/ui";
import { formatDateTime } from "@sanad/shared/lib/format";
import { statusTone } from "@sanad/shared/lib/status";

export function MyBookingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get<BookingSummary[]>("/api/v1/me/bookings") });
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <div>
      <PageHeader title="حجوزاتي" actions={<Link to="/directory" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">حجز جديد</Link>} />
      {!data || data.length === 0 ? (
        <EmptyState title="لا حجوزات بعد">ابدأ من الدليل واختر من يناسبك.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-primary">
                  <div>
                    <p className="font-bold">{b.providerDisplayName}</p>
                    <p className="text-sm text-muted">{b.serviceCategory} — <span className="num">{formatDateTime(b.slotStartUtc)}</span></p>
                  </div>
                  <Badge tone={statusTone(b.status)}>{t(`bookingStatus.${b.status}`)}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** تفاصيل الحجز للمستفيد: الحالة، الأفعال المتاحة، ملاحظتي (قراءة فقط)، والمحادثة الإدارية. */
export function BookingDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);
  const booking = useQuery({ queryKey: ["bookings", id], queryFn: () => api.get<BookingSummary>(`/api/v1/bookings/${id}`) });
  const note = useQuery({ queryKey: ["booking-note", id], queryFn: () => api.get<BookingNote>(`/api/v1/bookings/${id}/note`), enabled: Boolean(booking.data) });

  const act = useMutation({
    mutationFn: (action: "accept" | "cancel") => api.post(`/api/v1/bookings/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر تنفيذ الطلب."),
  });
  const openChat = useMutation({
    mutationFn: () => api.post<Conversation>(`/api/v1/bookings/${id}/conversation`),
    onSuccess: (c) => navigate(`/conversations/${c.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر فتح المحادثة."),
  });

  if (booking.isLoading) return <Loading />;
  if (booking.error || !booking.data) return <ErrorState error={booking.error ?? new Error("غير موجود")} />;
  const b = booking.data;
  const cancellable = ["Submitted", "UnderReview", "AlternativeProposed", "Accepted"].includes(b.status);
  const chatOpen = ["UnderReview", "AlternativeProposed", "Accepted", "AdministrativelyCompleted"].includes(b.status);
  const isProviderView = me?.providerProfileId === b.providerProfileId;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`حجز مع ${b.providerDisplayName}`} subtitle={<span className="num">{formatDateTime(b.slotStartUtc)}</span>} />
      <div className="grid gap-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{b.serviceCategory}</p>
            <Badge tone={statusTone(b.status)}>{t(`bookingStatus.${b.status}`)}</Badge>
          </div>
          {b.status === "AlternativeProposed" && <Banner tone="lamp" title="اقترح المختص موعداً بديلاً">الموعد الجديد: <span className="num">{formatDateTime(b.slotStartUtc)}</span></Banner>}
          {b.administrativeReasonForRejection && <p className="mt-3 text-sm text-muted">السبب الإداري: {b.administrativeReasonForRejection}</p>}
          {error && <div className="mt-3"><Banner tone="danger" role="alert">{error}</Banner></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {b.status === "AlternativeProposed" && !isProviderView && <Button busy={act.isPending} onClick={() => act.mutate("accept")}>قبول الموعد البديل</Button>}
            {chatOpen && <Button variant="secondary" busy={openChat.isPending} onClick={() => openChat.mutate()}>المحادثة الإدارية</Button>}
            {cancellable && (
              <Button variant="ghost" busy={act.isPending} onClick={() => window.confirm("هل تريد إلغاء هذا الحجز؟") && act.mutate("cancel")}>إلغاء الحجز</Button>
            )}
          </div>
        </Card>
        {!isProviderView && (
          <Card>
            <h2 className="font-bold">ملاحظتي للمختص</h2>
            <p className="mt-1 text-xs text-muted">مشفّرة — لا يراها إلا المختص المُسنَد.</p>
            <p className="mt-3 whitespace-pre-line leading-8">{note.data?.note ?? <span className="text-muted">لم تكتب ملاحظة.</span>}</p>
          </Card>
        )}
        {(b.status === "Accepted" || b.status === "AdministrativelyCompleted") && !isProviderView && (
          <Link to="/recommendations" className="text-sm font-semibold text-primary">توصيات مختصك تظهر في صفحة «توصياتي» ←</Link>
        )}
      </div>
    </div>
  );
}
