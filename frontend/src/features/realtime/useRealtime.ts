import { HubConnectionBuilder, LogLevel, type HubConnection } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { API_BASE } from "../../api/client";
import { useSession } from "../../stores/session";

/**
 * اتصال SignalR: الخادم يبث معرّفات فقط (لا نص) — العميل يعيد جلب البيانات عبر REST المحمي.
 */
export function useRealtime() {
  const accessToken = useSession((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
    let connection: HubConnection | null = new HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/chat`, { accessTokenFactory: () => useSession.getState().accessToken ?? "" })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on("messageReceived", (p: { conversationId: string }) => {
      void qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    });
    connection.on("bookingUpdated", () => void qc.invalidateQueries({ queryKey: ["bookings"] }));
    connection.on("notification", () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["recommendations"] });
    });

    connection.start().catch(() => {
      /* الوقت الفعلي تحسين فقط — الصفحات تعمل بالاستعلام الدوري بدونه */
    });
    return () => {
      void connection?.stop();
      connection = null;
    };
  }, [accessToken, qc]);
}
