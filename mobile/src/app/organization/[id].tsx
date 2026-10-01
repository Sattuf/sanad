import { ar } from "@sanad/shared/i18n/ar";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { AdministrativeDisclaimer, VerificationBadge, VerificationNote } from "@/components/Safety";
import { AppText, Banner, Card, Row, RowLink, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { directory } from "@/lib/directory";
import { useColors } from "@/theme";

export default function OrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { data, isLoading, error } = useQuery({ queryKey: ["organization", id], queryFn: () => directory.organization(id) });

  if (isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  if (error || !data)
    return (
      <Screen>
        <Banner tone="danger">{error instanceof ApiError ? error.friendly : "لم نجد هذه الجهة."}</Banner>
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: data.displayName }} />
      <Card>
        <AppText variant="title">{data.displayName}</AppText>
        <AppText variant="muted">{data.legalName}</AppText>
        <Row>
          <VerificationBadge verification={data.verification} />
          <Tag label={ar.track[data.track]} />
          {data.city ? <Tag label={data.city} /> : null}
        </Row>
        <VerificationNote verification={data.verification} />
        <AppText>{data.publicDescription}</AppText>
      </Card>
      <AppText variant="heading">المختصون في هذه الجهة</AppText>
      {data.providers.length === 0 ? <AppText variant="muted">لا مختصين منشورين بعد.</AppText> : null}
      {data.providers.map((p) => (
        <RowLink key={p.id} title={p.displayName} subtitle={p.title ?? undefined} onPress={() => router.push({ pathname: "/provider/[id]", params: { id: p.id } })} />
      ))}
      <AdministrativeDisclaimer />
    </Screen>
  );
}
