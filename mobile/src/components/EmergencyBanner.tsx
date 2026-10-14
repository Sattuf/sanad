import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEmergency } from "@/stores/emergency";
import { radius, space, useColors } from "@/theme";
import { AppText } from "./ui";

/**
 * شريط الإحالة العاجلة — فوق كل شاشة متى رُفعت إشارة خطر من أي استجابة.
 * بلا حركة ولا زخرفة (13 §13.4): الرسالة وأرقام الاتصال المباشر فقط.
 */
export function EmergencyBanner() {
  const referral = useEmergency((s) => s.referral);
  const dismiss = useEmergency((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const c = useColors();
  if (!referral) return null;

  return (
    <View accessibilityRole="alert" style={[styles.wrap, { paddingTop: insets.top + space.sm, backgroundColor: c.dangerBg, borderColor: c.danger }]}>
      <AppText variant="heading" style={{ color: c.danger }}>
        اطلب المساعدة الآن
      </AppText>
      <AppText>{referral.message}</AppText>
      <View style={styles.contacts}>
        {referral.contacts.map((contact) => (
          <Pressable
            key={contact.phoneNumber}
            accessibilityRole="link"
            accessibilityLabel={`${contact.label} ${contact.phoneNumber}`}
            onPress={() => Linking.openURL(`tel:${contact.phoneNumber}`)}
            style={[styles.call, { borderColor: c.danger }]}
          >
            <AppText style={{ color: c.danger }}>{contact.label}</AppText>
            <AppText variant="heading" style={{ color: c.danger }}>
              {contact.phoneNumber}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={12}>
        <AppText variant="muted">إخفاء الشريط</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm, borderBottomWidth: 2 },
  contacts: { gap: space.sm },
  call: { borderWidth: 2, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
