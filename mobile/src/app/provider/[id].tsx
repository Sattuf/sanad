import { ar } from "@sanad/shared/i18n/ar";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AdministrativeDisclaimer, VerificationBadge, VerificationNote } from "@/components/Safety";
import { AppText, Banner, Button, Card, Row, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { directory } from "@/lib/directory";
import { useSignedIn } from "@/lib/queries";
import { space, useColors } from "@/theme";

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const signedIn = useSignedIn();
  const { data, isLoading, error } = useQuery({ queryKey: ["provider", id], queryFn: () => directory.provider(id) });

  if (isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  if (error || !data)
    return (
      <Screen>
        <Banner tone="danger">{error instanceof ApiError ? error.friendly : "لم نجد هذا المختص."}</Banner>
      </Screen>
    );

  const book = (offeringId: string) =>
    signedIn ? router.push({ pathname: "/book/[providerId]", params: { providerId: data.id, offering: offeringId } }) : router.push("/auth/login");

  return (
    <Screen>
      <Stack.Screen options={{ title: data.displayName }} />
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="title">{data.displayName}</AppText>
            <AppText variant="muted">{data.declaredTitle}</AppText>
          </View>
          <VerificationBadge verification={data.verification} />
        </View>
        <VerificationNote verification={data.verification} />
        <Row>
          <Tag tone="primary" label={ar.practitionerType[data.practitionerType]} />
          <Tag label={ar.track[data.track]} />
          <Tag label={ar.deliveryMode[data.deliveryMode]} />
          {data.city ? <Tag label={data.city} /> : null}
          {data.languages.map((l) => (
            <Tag key={l} label={l} />
          ))}
        </Row>
        {data.organizationName && data.organizationId ? (
          <Button
            label={`ضمن جهة: ${data.organizationName}`}
            variant="ghost"
            onPress={() => router.push({ pathname: "/organization/[id]", params: { id: data.organizationId! } })}
          />
        ) : null}
      </Card>
      <Card>
        <AppText variant="heading">نطاق الممارسة</AppText>
        <AppText>{data.practiceScope}</AppText>
        <AppText variant="heading">حدود الممارسة المهنية</AppText>
        <AppText variant="muted">{data.professionalBoundariesNote}</AppText>
      </Card>
      <AppText variant="heading">الخدمات</AppText>
      {data.offerings.length === 0 ? <AppText variant="muted">لا خدمات منشورة بعد.</AppText> : null}
      {data.offerings.map((o) => (
        <Card key={o.id}>
          <AppText variant="heading">{o.category}</AppText>
          <AppText variant="muted">{`${o.sessionDurationMinutes} دقيقة — مجانية`}</AppText>
          <AppText>{o.description}</AppText>
          <AppText variant="muted">{`سياسة الإلغاء: ${o.cancellationPolicy}`}</AppText>
          {o.explicitExclusions.length > 0 ? <AppText variant="muted">{`لا تشمل: ${o.explicitExclusions.join("، ")}`}</AppText> : null}
          <Button label={signedIn ? "احجز موعداً" : "ادخل لتحجز"} onPress={() => book(o.id)} />
        </Card>
      ))}
      <AdministrativeDisclaimer />
    </Screen>
  );
}
