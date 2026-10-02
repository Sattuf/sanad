import type { PrivacyPreferences } from "@sanad/shared/api/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { AppText, Banner, Button, Card, Chip, Row, Screen, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { account, queryKeys, useMe } from "@/lib/queries";
import { space, useColors } from "@/theme";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** الاسم الظاهر وتفضيلات الخصوصية. */
export default function ProfileSettingsScreen() {
  const c = useColors();
  const me = useMe();
  if (!me.data) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  return <Form key={me.data.id} initialName={me.data.displayName} initialPrivacy={{
    hideIdentityUntilBookingConfirmed: me.data.hideIdentityUntilBookingConfirmed,
    quietHoursStartHourUtc: me.data.quietHoursStartHourUtc,
    quietHoursEndHourUtc: me.data.quietHoursEndHourUtc,
  }} />;
}

function Form({ initialName, initialPrivacy }: { initialName: string; initialPrivacy: PrivacyPreferences }) {
  const c = useColors();
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [message, setMessage] = useState<string | null>(null);
  const quiet = privacy.quietHoursStartHourUtc !== null && privacy.quietHoursEndHourUtc !== null;

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim() !== initialName) await account.rename(name);
      await account.savePrivacy(privacy);
    },
    onSuccess: async () => {
      setMessage("تم الحفظ.");
      await qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  return (
    <Screen>
      <Card>
        <TextField label="الاسم الظاهر" value={name} onChangeText={setName} maxLength={100} hint="هو ما يراه المختصون والمنسقون في حجوزاتك." />
      </Card>
      <Card>
        <AppText variant="heading">الخصوصية</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <AppText style={{ flex: 1 }}>إخفاء اسمي عن المختص حتى تأكيد الحجز</AppText>
          <Switch
            accessibilityLabel="إخفاء اسمي عن المختص حتى تأكيد الحجز"
            value={privacy.hideIdentityUntilBookingConfirmed}
            onValueChange={(v) => setPrivacy((p) => ({ ...p, hideIdentityUntilBookingConfirmed: v }))}
            trackColor={{ true: c.primary, false: c.border }}
          />
        </View>
        <AppText variant="muted">يظهر اسمك للمختص باسم «مستفيد» إلى أن يقبل طلب حجزك.</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.md }}>
          <AppText style={{ flex: 1 }}>ساعات هدوء (بتوقيت UTC)</AppText>
          <Switch
            accessibilityLabel="ساعات هدوء"
            value={quiet}
            onValueChange={(on) => setPrivacy((p) => ({ ...p, quietHoursStartHourUtc: on ? 22 : null, quietHoursEndHourUtc: on ? 7 : null }))}
            trackColor={{ true: c.primary, false: c.border }}
          />
        </View>
        <AppText variant="muted">لا تصلك خلالها إشعارات غير عاجلة — تنبيهات السلامة العاجلة تصل دائماً.</AppText>
        {quiet ? (
          <>
            <AppText>من</AppText>
            <Row>
              {HOURS.map((h) => (
                <Chip key={`s${h}`} label={hh(h)} active={privacy.quietHoursStartHourUtc === h} onPress={() => setPrivacy((p) => ({ ...p, quietHoursStartHourUtc: h }))} />
              ))}
            </Row>
            <AppText>إلى</AppText>
            <Row>
              {HOURS.map((h) => (
                <Chip key={`e${h}`} label={hh(h)} active={privacy.quietHoursEndHourUtc === h} onPress={() => setPrivacy((p) => ({ ...p, quietHoursEndHourUtc: h }))} />
              ))}
            </Row>
          </>
        ) : null}
      </Card>
      {message ? <Banner tone="success">{message}</Banner> : null}
      {save.error ? <Banner tone="danger">{save.error instanceof ApiError ? save.error.friendly : "تعذّر الحفظ."}</Banner> : null}
      <Button label="حفظ" busy={save.isPending} disabled={!name.trim()} onPress={() => { setMessage(null); save.mutate(); }} />
    </Screen>
  );
}
