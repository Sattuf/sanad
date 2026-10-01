import { formatDateTime } from "@sanad/shared/lib/format";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText, Banner, Button, Card, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { bookingStatusLabel, bookings, bookingTagTone } from "@/lib/directory";
import { space, useColors } from "@/theme";

export default function MyBookingsScreen() {
  const c = useColors();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({ queryKey: ["bookings", "mine"], queryFn: bookings.mine });
  if (isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  return (
    <Screen>
      {error ? <Banner tone="danger">{error instanceof ApiError ? error.friendly : "تعذّر تحميل حجوزاتك."}</Banner> : null}
      {data && data.length === 0 ? (
        <Card>
          <AppText>لا حجوزات بعد. ابدأ من الدليل واختر من يناسبك.</AppText>
          <Button label="افتح الدليل" onPress={() => router.navigate("/directory")} />
        </Card>
      ) : null}
      {data?.map((b) => (
        <Pressable key={b.id} accessibilityRole="link" onPress={() => router.push({ pathname: "/bookings/[id]", params: { id: b.id } })}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
              <AppText variant="heading" style={{ flex: 1 }}>
                {b.providerDisplayName}
              </AppText>
              <Tag label={bookingStatusLabel(b.status)} tone={bookingTagTone(b.status)} />
            </View>
            <AppText variant="muted">{`${b.serviceCategory} — ${formatDateTime(b.slotStartUtc)}`}</AppText>
          </Card>
        </Pressable>
      ))}
      <Button label="تحديث" variant="ghost" busy={isRefetching} onPress={() => void refetch()} />
    </Screen>
  );
}
