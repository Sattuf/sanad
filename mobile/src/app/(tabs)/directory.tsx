import type { DirectoryFilters } from "@sanad/shared/api/directory";
import type { DeliveryMode, DirectoryItem, OrganizationTrack, PractitionerType } from "@sanad/shared/api/types";
import { ar } from "@sanad/shared/i18n/ar";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { VerificationBadge } from "@/components/Safety";
import { AppText, Banner, Button, Card, Chip, Row, Screen, Tag } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { directory } from "@/lib/directory";
import { fonts, radius, space, useColors } from "@/theme";

const TYPES: { value: PractitionerType | null; label: string }[] = [
  { value: null, label: "الكل" },
  { value: "LicensedPhysician", label: ar.practitionerType.LicensedPhysician },
  { value: "ReligiousPractitioner", label: ar.practitionerType.ReligiousPractitioner },
];
const MODES: { value: DeliveryMode | null; label: string }[] = [
  { value: null, label: "أي طريقة" },
  { value: "Remote", label: ar.deliveryMode.Remote },
  { value: "InPerson", label: ar.deliveryMode.InPerson },
];

const isTrack = (v: string | undefined): v is OrganizationTrack => !!v && v in ar.track;

/** الدليل: الترتيب من مطابقة البحث وحالة التوثيق فقط — لا ترتيب مموَّل. عام بلا حساب. */
export default function DirectoryScreen() {
  const c = useColors();
  const [text, setText] = useState("");
  // روابط من الأدلة قد تفتح الدليل على مسار محدد (?track=LicensedHealth)
  const { track } = useLocalSearchParams<{ track?: string }>();
  const [filters, setFilters] = useState<DirectoryFilters>(() => ({ track: isTrack(track) ? track : null }));
  const [lastTrack, setLastTrack] = useState(track);
  if (track !== lastTrack) {
    setLastTrack(track);
    setFilters((f) => ({ ...f, track: isTrack(track) ? track : null }));
  }
  const results = useInfiniteQuery({
    queryKey: ["directory", filters],
    queryFn: ({ pageParam }) => directory.search(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;

  return (
    <Screen>
      <AppText variant="muted">جهات ومقدّمو خدمة موثّقون إدارياً. الترتيب من مطابقة بحثك وحالة التوثيق فقط — لا ترتيب مموَّل.</AppText>
      <TextInput
        accessibilityLabel="بحث في الدليل"
        placeholder="ابحث باسم أو خدمة أو نطاق…"
        placeholderTextColor={c.muted}
        value={text}
        onChangeText={setText}
        returnKeyType="search"
        onSubmitEditing={() => setFilters((f) => ({ ...f, q: text }))}
        style={{ minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: c.surface, color: c.text, fontFamily: fonts.body, textAlign: "right" }}
      />
      {filters.track ? (
        <Row>
          <Chip label={`المسار: ${ar.track[filters.track]} ✕`} active onPress={() => setFilters((f) => ({ ...f, track: null }))} />
        </Row>
      ) : null}
      <Row>
        {TYPES.map((t) => (
          <Chip key={t.label} label={t.label} active={(filters.practitionerType ?? null) === t.value} onPress={() => setFilters((f) => ({ ...f, practitionerType: t.value }))} />
        ))}
      </Row>
      <Row>
        {MODES.map((m) => (
          <Chip key={m.label} label={m.label} active={(filters.deliveryMode ?? null) === m.value} onPress={() => setFilters((f) => ({ ...f, deliveryMode: m.value }))} />
        ))}
      </Row>
      {results.isLoading ? <ActivityIndicator color={c.primary} /> : null}
      {results.isError ? <Banner tone="danger">{results.error instanceof ApiError ? results.error.friendly : "تعذّر تحميل الدليل."}</Banner> : null}
      {results.isSuccess ? <AppText variant="muted">{total === 0 ? "لا نتائج مطابقة بعد. جرّب كلمات أخرى أو أزل بعض عوامل التصفية." : `${total} نتيجة`}</AppText> : null}
      {items.map((item) => (
        <DirectoryCard key={`${item.kind}-${item.id}`} item={item} />
      ))}
      {results.hasNextPage ? <Button label="عرض المزيد" variant="secondary" busy={results.isFetchingNextPage} onPress={() => void results.fetchNextPage()} /> : null}
    </Screen>
  );
}

function DirectoryCard({ item }: { item: DirectoryItem }) {
  const open = () =>
    item.kind === "Provider"
      ? router.push({ pathname: "/provider/[id]", params: { id: item.id } })
      : router.push({ pathname: "/organization/[id]", params: { id: item.id } });
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={item.displayName} onPress={open} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{item.displayName}</AppText>
            {item.title ? <AppText variant="muted">{item.title}</AppText> : null}
          </View>
          <VerificationBadge verification={item.verification} />
        </View>
        <AppText variant="muted" numberOfLines={3}>
          {item.summary}
        </AppText>
        <Row>
          <Tag tone="primary" label={item.kind === "Organization" ? "جهة" : item.practitionerType ? ar.practitionerType[item.practitionerType] : "مختص"} />
          <Tag label={ar.track[item.track]} />
          {item.deliveryMode ? <Tag label={ar.deliveryMode[item.deliveryMode]} /> : null}
          {item.city ? <Tag label={item.city} /> : null}
          {item.organizationName ? <Tag label={`ضمن: ${item.organizationName}`} /> : null}
        </Row>
      </Card>
    </Pressable>
  );
}
