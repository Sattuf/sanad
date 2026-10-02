import { HubConnectionBuilder, LogLevel, type HubConnection } from "@microsoft/signalr";
import { realtimeInvalidations } from "@sanad/shared/api/care";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { API_BASE } from "@/lib/api";
import { useSession } from "@/stores/session";

/**
 * اتصال SignalR ما دام المستخدم مسجّلاً والتطبيق في المقدّمة. الخادم يبث معرّفات فقط (لا نص)،
 * والتطبيق يعيد الجلب عبر REST المحمي. الوقت الفعلي تحسين فقط — الشاشات تعمل بالاستعلام الدوري بدونه.
 */
export function RealtimeBridge() {
  const accessToken = useSession((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
    const invalidate = (keys: readonly (readonly string[])[]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey: [...queryKey] }));
    const connection: HubConnection = new HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/chat`, { accessTokenFactory: () => useSession.getState().accessToken ?? "" })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.None)
      .build();
    connection.on("messageReceived", (p: { conversationId: string }) => invalidate(realtimeInvalidations.messageReceived(p)));
    connection.on("bookingUpdated", () => invalidate(realtimeInvalidations.bookingUpdated()));
    connection.on("notification", () => invalidate(realtimeInvalidations.notification()));

    const start = () => connection.start().catch(() => undefined);
    void start();
    // في الخلفية يُغلق الاتصال (توفير البطارية)، ويُستأنف مع تحديث البيانات عند العودة
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void start();
        void qc.invalidateQueries();
      } else if (state === "background") void connection.stop();
    });
    return () => {
      sub.remove();
      void connection.stop();
    };
  }, [accessToken, qc]);

  return null;
}
