import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import type { ChatMessage, Conversation, PostedMessage, ReportCategory } from "@sanad/shared/api/types";
import { UnmonitoredChatWarning } from "../../components/safety";
import { Banner, Button, Card, ErrorState, Loading, PageHeader, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatTime } from "@sanad/shared/lib/format";

/** المحادثة الإدارية: نص فقط (لا مرفقات — 12 §12.5) مشفّر في الخادم (ADR-0007). */
export function ConversationPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<Conversation[]>("/api/v1/me/conversations") });
  const messages = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.get<ChatMessage[]>(`/api/v1/conversations/${id}/messages?take=100`),
    refetchInterval: 30_000,
  });
  const current = conversations.data?.find((c) => c.id === id);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.data?.length]);

  const send = useMutation({
    mutationFn: () => api.post<PostedMessage>(`/api/v1/conversations/${id}/messages`, { body: body.trim() }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الإرسال."),
  });

  if (messages.isLoading) return <Loading />;
  if (messages.error) return <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />;
  const active = !current || current.status === "Active";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={current ? `محادثة مع ${current.counterpartDisplayName}` : "المحادثة"} actions={<Button variant="ghost" onClick={() => setReporting((v) => !v)}>إبلاغ</Button>} />
      <UnmonitoredChatWarning />
      {reporting && <ReportConversation conversationId={id!} onDone={() => setReporting(false)} />}
      <Card className="mt-4">
        <ol className="flex max-h-[55vh] min-h-64 flex-col gap-2 overflow-y-auto" aria-live="polite">
          {(messages.data ?? []).map((m) => (
            <li key={m.id} className={cx("max-w-[80%] rounded-2xl px-4 py-2", m.isMine ? "ms-auto bg-primary text-primary-contrast" : "me-auto bg-surface-2")}>
              <p className="whitespace-pre-line leading-7">{m.body}</p>
              <p className={cx("num mt-1 text-[11px]", m.isMine ? "opacity-80" : "text-muted")}>{formatTime(m.sentAtUtc)}</p>
            </li>
          ))}
          {messages.data?.length === 0 && <li className="py-10 text-center text-muted">لا رسائل بعد. ابدأ بتنسيق تفاصيل موعدك.</li>}
          <div ref={endRef} />
        </ol>
      </Card>
      {!active && <div className="mt-3"><Banner tone="warning">هذه المحادثة مقيّدة إدارياً ولا تقبل رسائل جديدة.</Banner></div>}
      <form
        className="mt-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (body.trim()) send.mutate();
        }}
      >
        <label htmlFor="msg" className="sr-only">رسالتك</label>
        <Textarea id="msg" className="min-h-20" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب رسالة إدارية…" disabled={!active} />
        {error && <Banner tone="danger" role="alert">{error}</Banner>}
        <div><Button type="submit" busy={send.isPending} disabled={!body.trim() || !active}>إرسال</Button></div>
      </form>
    </div>
  );
}

function ReportConversation({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ReportCategory>("Harassment");
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);
  const report = useMutation({
    mutationFn: () => api.post(`/api/v1/conversations/${conversationId}/report`, { category, severity: "Medium", description: description.trim() || null }),
    onSuccess: () => setDone(true),
  });
  if (done)
    return (
      <div className="mt-3"><Banner tone="success" title="وصل بلاغك">سيراجعه فريق التنسيق. <button className="underline" onClick={onDone}>إغلاق</button></Banner></div>
    );
  return (
    <Card className="mt-3">
      <h2 className="font-bold">الإبلاغ عن هذه المحادثة</h2>
      <div className="mt-3 grid gap-3">
        <Select aria-label="نوع المشكلة" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
          {(["Harassment", "FinancialExploitation", "Impersonation", "UnauthorizedClaim", "PrivacyViolation", "Other"] as const).map((c) => (
            <option key={c} value={c}>{t(`reportCategory.${c}`)}</option>
          ))}
        </Select>
        <Textarea aria-label="وصف مختصر" value={description} maxLength={3000} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر (اختياري، يُحفظ مشفّراً)" />
        {report.error && <Banner tone="danger">{report.error instanceof ApiError ? report.error.friendly : "تعذّر الإرسال"}</Banner>}
        <div className="flex gap-2">
          <Button busy={report.isPending} onClick={() => report.mutate()}>إرسال البلاغ</Button>
          <Button variant="ghost" onClick={onDone}>إلغاء</Button>
        </div>
      </div>
    </Card>
  );
}
