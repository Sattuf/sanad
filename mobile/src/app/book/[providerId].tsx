import { canSubmitBooking, groupSlotsByDay, MAX_BOOKING_NOTE } from "@sanad/shared/api/directory";
import { formatDay, formatTime } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AdministrativeDisclaimer } from "@/components/Safety";
import { AppText, Banner, Button, Card, Checkbox, Chip, Row, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { bookings, directory } from "@/lib/directory";
import { space, useColors } from "@/theme";

/**
 * طلب حجز: خدمة وفترة، و«ملاحظتك للمختص» الاختيارية (مشفّرة، يراها المختص المُسنَد فقط، وبموافقة صريحة).
 * مفتاح Idempotency ثابت لكل محاولة — إعادة الإرسال بعد انقطاع الشبكة لا تُنشئ حجزاً ثانياً.
 * إشارة الخطر في الملاحظة ترفع شريط الطوارئ تلقائياً من عميل الـ API، نجح الحجز أو فشل.
 */
export default function BookScreen() {
  const { providerId, offering } = useLocalSearchParams<{ providerId: string; offering?: string }>();
  const c = useColors();
  const qc = useQueryClient();
  const idempotencyKey = useRef(Crypto.randomUUID());
  const provider = useQuery({ queryKey: ["provider", providerId], queryFn: () => directory.provider(providerId) });
  const slots = useQuery({ queryKey: ["availability", providerId], queryFn: () => directory.availability(providerId) });
  const [offeringId, setOfferingId] = useState(offering ?? "");
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grouped = useMemo(() => groupSlotsByDay(slots.data ?? [], formatDay), [slots.data]);

  const book = useMutation({
    mutationFn: () =>
      bookings.create(
        { serviceOfferingId: offeringId, availabilitySlotId: slotId, beneficiaryNote: note.trim() || null, consentToSensitiveNoteProcessing: consent },
        idempotencyKey.current,
      ),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      router.replace({ pathname: "/bookings/[id]", params: { id: res.id } });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.friendly : "تعذّر إرسال الطلب.");
      // الفترة حُجزت قبلك: تحديث المواعيد ومحاولة جديدة بمفتاح جديد
      if (err instanceof ApiError && err.status === 409) {
        void slots.refetch();
        setSlotId("");
        idempotencyKey.current = Crypto.randomUUID();
      }
    },
  });

  if (provider.isLoading || slots.isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  if (!provider.data)
    return (
      <Screen>
        <Banner tone="danger">{provider.error instanceof ApiError ? provider.error.friendly : "لم نجد هذا المختص."}</Banner>
      </Screen>
    );

  const hasNote = note.trim().length > 0;
  return (
    <Screen>
      <Stack.Screen options={{ title: `حجز مع ${provider.data.displayName}` }} />
      <AppText variant="muted">الخدمة مجانية بالكامل. سيراجع المختص طلبك ويؤكده أو يقترح موعداً بديلاً.</AppText>
      <Card>
        <AppText variant="heading">الخدمة</AppText>
        <Row>
          {provider.data.offerings.map((o) => (
            <Chip key={o.id} label={`${o.category} — ${o.sessionDurationMinutes} دقيقة`} active={offeringId === o.id} onPress={() => setOfferingId(o.id)} />
          ))}
        </Row>
      </Card>
      <Card>
        <AppText variant="heading">الموعد</AppText>
        {slots.isError ? <Banner tone="danger">تعذّر تحميل المواعيد.</Banner> : null}
        {grouped.length === 0 && !slots.isError ? <AppText variant="muted">لا مواعيد متاحة حالياً. عُد لاحقاً — يضيف المختصون مواعيدهم دورياً.</AppText> : null}
        {grouped.map(([day, list]) => (
          <View key={day} style={{ gap: space.xs }}>
            <AppText variant="muted">{day}</AppText>
            <Row>
              {list.map((s) => (
                <Chip key={s.id} label={formatTime(s.startUtc)} active={slotId === s.id} onPress={() => setSlotId(s.id)} />
              ))}
            </Row>
          </View>
        ))}
      </Card>
      <Card>
        <TextField
          label="ملاحظتك للمختص (اختيارية)"
          multiline
          maxLength={MAX_BOOKING_NOTE}
          value={note}
          onChangeText={setNote}
          placeholder="ما الذي تودّ أن يعرفه المختص قبل الموعد؟"
          hint={`تُحفظ مشفّرة، ولا يراها إلا المختص المُسنَد لهذا الحجز. ${note.length}/${MAX_BOOKING_NOTE}`}
        />
        {hasNote ? (
          <Checkbox checked={consent} onChange={setConsent}>
            أوافق على معالجة هذه الملاحظة الحساسة (تُشفَّر ولا يطّلع عليها إلا المختص المُسنَد، أو فريق التنسيق عند وجود خطر).
          </Checkbox>
        ) : null}
        <AppText variant="muted">إن كنت في خطر الآن فلا تنتظر الموعد — اتصل بالطوارئ من الصفحة الرئيسية.</AppText>
      </Card>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button
        label="إرسال طلب الحجز"
        busy={book.isPending}
        disabled={!canSubmitBooking(offeringId, slotId, note, consent)}
        onPress={() => {
          setError(null);
          book.mutate();
        }}
      />
      <AdministrativeDisclaimer />
    </Screen>
  );
}
