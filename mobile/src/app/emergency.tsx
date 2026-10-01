import type { EmergencyReferral } from "@sanad/shared/api/types";
import { FALLBACK_REFERRAL } from "@sanad/shared/safety/emergency";
import { useQuery } from "@tanstack/react-query";
import { Linking, Pressable, StyleSheet } from "react-native";
import { AppText, Card, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { radius, space, useColors } from "@/theme";

/** صفحة الطوارئ — بلا حركة ولا زخرفة، وتعمل دون اتصال بأرقام احتياطية محلية. */
export default function EmergencyScreen() {
  const c = useColors();
  const { data } = useQuery({
    queryKey: ["emergency-info"],
    queryFn: () => api.get<EmergencyReferral>("/api/v1/safety/emergency-info", { auth: false }),
    staleTime: Infinity,
  });
  const info = data ?? FALLBACK_REFERRAL;
  return (
    <Screen>
      <AppText variant="title" style={{ color: c.danger }}>
        إن كنت في خطر الآن
      </AppText>
      <AppText>{info.message}</AppText>
      {info.contacts.map((contact) => (
        <Pressable
          key={contact.phoneNumber}
          accessibilityRole="link"
          accessibilityLabel={`${contact.label} ${contact.phoneNumber}`}
          onPress={() => Linking.openURL(`tel:${contact.phoneNumber}`)}
          style={[styles.call, { borderColor: c.danger, backgroundColor: c.dangerBg }]}
        >
          <AppText style={{ color: c.danger }}>{contact.label}</AppText>
          <AppText variant="title" style={{ color: c.danger }}>
            {contact.phoneNumber}
          </AppText>
        </Pressable>
      ))}
      <Card>
        <AppText variant="heading">ما الذي يمكنك فعله الآن</AppText>
        <AppText variant="muted">• اتصل بالطوارئ أو اذهب لأقرب قسم طوارئ.</AppText>
        <AppText variant="muted">• ابقَ مع شخص تثق به، ولا تبقَ وحدك.</AppText>
        <AppText variant="muted">• أبعد أي وسيلة قد تؤذيك عن متناولك.</AppText>
        <AppText variant="muted">• إن كان الخطر على شخص آخر (خصوصاً طفل)، أبلغ الجهات المختصة فوراً.</AppText>
      </Card>
      <AppText variant="muted">سند منصة توثيق وحجز إداري، وليست خدمة طوارئ أو علاج، ولا تتابع الرسائل لحظياً.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  call: { borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: space.xl, paddingVertical: space.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
