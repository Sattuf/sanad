import { formatDateTime } from "@sanad/shared/lib/format";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { AppText, Banner, RowLink, Screen } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { care } from "@/lib/care";
import { useColors } from "@/theme";

export default function ConversationsScreen() {
  const c = useColors();
  const { data, isLoading, error } = useQuery({ queryKey: ["conversations"], queryFn: care.conversations });
  if (isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  return (
    <Screen>
      {error ? <Banner tone="danger">{error instanceof ApiError ? error.friendly : "تعذّر التحميل."}</Banner> : null}
      {data?.length === 0 ? <AppText variant="muted">لا محادثات بعد. تُفتح المحادثة الإدارية من صفحة الحجز بعد مراجعته.</AppText> : null}
      {data?.map((conv) => (
        <RowLink
          key={conv.id}
          title={conv.counterpartDisplayName}
          subtitle={conv.lastMessageAtUtc ? `آخر رسالة: ${formatDateTime(conv.lastMessageAtUtc)}` : "لا رسائل بعد"}
          onPress={() => router.push({ pathname: "/conversations/[id]", params: { id: conv.id } })}
        />
      ))}
    </Screen>
  );
}
