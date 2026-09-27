import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Recommendation } from "../../api/types";
import { TrackMedia } from "../../components/TrackMedia";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader } from "../../components/ui";
import { formatDateTime } from "../../lib/format";

/**
 * توصياتي (بوابة المستفيد) — قائمة زمنية لما أرسله المختص: نص التوجيه + مشغّل لأي مقطع مقترح.
 * هذه الشاشة لا تعرض أبداً ملاحظة المختص الخاصة — تلك لا تصل للمستفيد تحت أي ظرف.
 */
export function MyRecommendationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["recommendations"], queryFn: () => api.get<Recommendation[]>("/api/v1/me/recommendations") });
  const ack = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/me/recommendations/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="توصياتي" subtitle="توجيهات أرسلها مختصك لك مباشرة. هي توجيه عام ومحتوى للاستماع — لا وصفة علاجية ولا جرعات دوائية." />
      {!data || data.length === 0 ? (
        <EmptyState title="لا توصيات بعد">بعد تأكيد موعدك، قد يرسل لك مختصك توجيهاً أو مقاطع للاستماع.</EmptyState>
      ) : (
        <ol className="grid gap-4">
          {data.map((r) => (
            <li key={r.id}>
              <Card as="article">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{r.providerDisplayName}</p>
                  <span className="num text-sm text-muted">{formatDateTime(r.recordedAtUtc)}</span>
                </div>
                <p className="mt-3 whitespace-pre-line leading-8">{r.guidanceText}</p>
                {r.recommendedTracks.length > 0 && (
                  <div className="mt-4 grid gap-2">
                    <p className="text-sm font-semibold text-muted">مقاطع مقترحة للاستماع</p>
                    {r.recommendedTracks.map((t) => (
                      <div key={t.id}>
                        <p className="mb-1 text-sm">{t.title} <span className="text-muted">— {t.sourceLabel}</span></p>
                        <TrackMedia track={t} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  {r.acknowledgedAtUtc ? (
                    <Badge tone="success">اطّلعت عليها</Badge>
                  ) : (
                    <Button variant="secondary" busy={ack.isPending && ack.variables === r.id} onClick={() => ack.mutate(r.id)}>
                      تم الاطّلاع
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
