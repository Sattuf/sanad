import type { ApiClient } from "./core";
import type { ChatMessage, Conversation, PostedMessage, Recommendation, ReportCategory } from "./types";

/** المحادثة الإدارية والتوصيات — مشتركة بين الويب والجوال. */
export function careApi(api: ApiClient["api"]) {
  return {
    conversations: () => api.get<Conversation[]>("/api/v1/me/conversations"),
    openForBooking: (bookingId: string) => api.post<Conversation>(`/api/v1/bookings/${encodeURIComponent(bookingId)}/conversation`),
    messages: (conversationId: string, take = 100) => api.get<ChatMessage[]>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?take=${take}`),
    /** كل رسالة تمر على كاشف الخطر في الخادم — إشارة الطوارئ تُلتقط في نواة العميل. */
    send: (conversationId: string, body: string) => api.post<PostedMessage>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { body: body.trim() }),
    report: (conversationId: string, category: ReportCategory, description: string) =>
      api.post<void>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/report`, { category, severity: "Medium", description: description.trim() || null }),

    recommendations: () => api.get<Recommendation[]>("/api/v1/me/recommendations"),
    acknowledge: (id: string) => api.post<void>(`/api/v1/me/recommendations/${encodeURIComponent(id)}/acknowledge`),
  };
}

export const MAX_MESSAGE = 4000;
export const REPORT_CATEGORIES: ReportCategory[] = ["Harassment", "FinancialExploitation", "Impersonation", "UnauthorizedClaim", "PrivacyViolation", "Other"];

/** أحداث SignalR تحمل معرّفات فقط (لا نص) — العميل يعيد الجلب عبر REST المحمي. هذه مفاتيح الاستعلامات المتأثرة بكل حدث. */
export const realtimeInvalidations = {
  messageReceived: (p: { conversationId: string }) => [["messages", p.conversationId], ["conversations"]],
  bookingUpdated: () => [["bookings"]],
  notification: () => [["notifications"], ["recommendations"]],
} as const;
