import { isCancellable, isChatOpen } from "@sanad/shared/api/directory";
import { formatDateTime } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { AppText, Banner, Button, Card, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { care } from "@/lib/care";
import { bookingStatusLabel, bookings, bookingTagTone } from "@/lib/directory";
import { space, useColors } from "@/theme";

/** تفاصيل الحجز للمستفيد: الحالة، الأفعال المتاحة، وملاحظتي (قراءة فقط). */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const booking = useQuery({ queryKey: ["bookings", id], queryFn: () => bookings.get(id) });
  const note = useQuery({ queryKey: ["booking-note", id], queryFn: () => bookings.note(id), enabled: !!booking.data });
  const act = useMutation({
    mutationFn: (action: "accept" | "cancel") => (action === "accept" ? bookings.accept(id) : bookings.cancel(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر تنفيذ الطلب."),
  });

  const openChat = useMutation({
    mutationFn: () => care.openForBooking(id),
    onSuccess: (conv) => router.push({ pathname: "/conversations/[id]", params: { id: conv.id } }),
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر فتح المحادثة."),
  });

  if (booking.isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  if (!booking.data)
    return (
      <Screen>
        <Banner tone="danger">{booking.error instanceof ApiError ? booking.error.friendly : "لم نجد هذا الحجز."}</Banner>
      </Screen>
    );
  const b = booking.data;

  const confirmCancel = () =>
    Alert.alert("إلغاء الحجز", "هل تريد إلغاء هذا الحجز؟", [
      { text: "تراجع", style: "cancel" },
      { text: "إلغاء الحجز", style: "destructive", onPress: () => act.mutate("cancel") },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: `حجز مع ${b.providerDisplayName}` }} />
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <AppText variant="heading" style={{ flex: 1 }}>
            {b.serviceCategory}
          </AppText>
          <Tag label={bookingStatusLabel(b.status)} tone={bookingTagTone(b.status)} />
        </View>
        <AppText>{formatDateTime(b.slotStartUtc)}</AppText>
        {b.status === "AlternativeProposed" ? <Banner tone="info">{`اقترح المختص موعداً بديلاً: ${formatDateTime(b.slotStartUtc)}`}</Banner> : null}
        {b.administrativeReasonForRejection ? <AppText variant="muted">{`السبب الإداري: ${b.administrativeReasonForRejection}`}</AppText> : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {b.status === "AlternativeProposed" ? <Button label="قبول الموعد البديل" busy={act.isPending} onPress={() => act.mutate("accept")} /> : null}
        {isChatOpen(b.status) ? <Button label="المحادثة الإدارية" variant="secondary" busy={openChat.isPending} onPress={() => openChat.mutate()} /> : null}
        {isCancellable(b.status) ? <Button label="إلغاء الحجز" variant="ghost" disabled={act.isPending} onPress={confirmCancel} /> : null}
      </Card>
      {b.status === "Accepted" || b.status === "AdministrativelyCompleted" ? (
        <Button label="توصيات مختصك في «توصياتي»" variant="ghost" onPress={() => router.push("/recommendations")} />
      ) : null}
      <Card>
        <AppText variant="heading">ملاحظتي للمختص</AppText>
        <AppText variant="muted">مشفّرة — لا يراها إلا المختص المُسنَد.</AppText>
        <AppText>{note.data?.note ?? "لم تكتب ملاحظة."}</AppText>
      </Card>
    </Screen>
  );
}
