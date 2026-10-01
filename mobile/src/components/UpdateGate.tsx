import { FALLBACK_REFERRAL } from "@sanad/shared/safety/emergency";
import { isBelowMinimum } from "@sanad/shared/lib/version";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import type { ReactNode } from "react";
import { Linking, Platform, View } from "react-native";
import { auth } from "@/lib/auth";
import { queryKeys } from "@/lib/queries";
import { space, useColors } from "@/theme";
import { AppText, Button } from "./ui";

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

/**
 * إصدار أقدم من الحد الأدنى المعلن على الخادم ⇐ شاشة «حدّث التطبيق» بدل أن تنكسر الطلبات بصمت.
 * يفشل مفتوحاً: بلا شبكة أو بخطأ يعمل التطبيق كالمعتاد (الأوراد والطوارئ تعمل دون اتصال).
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const c = useColors();
  const { data } = useQuery({ queryKey: queryKeys.minVersion, queryFn: auth.minVersion, retry: false, staleTime: 60 * 60_000 });
  const minimum = Platform.OS === "ios" ? data?.ios : data?.android;
  if (!minimum || !isBelowMinimum(APP_VERSION, minimum)) return <>{children}</>;

  const storeUrl = Platform.OS === "ios" ? data?.iosStoreUrl : data?.androidStoreUrl;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, justifyContent: "center", gap: space.lg }}>
      <AppText variant="title">يلزم تحديث سند</AppText>
      <AppText>{`هذا الإصدار (${APP_VERSION}) لم يعد مدعوماً. حدّث التطبيق للمتابعة بأمان.`}</AppText>
      {storeUrl ? <Button label="التحديث من المتجر" onPress={() => Linking.openURL(storeUrl)} /> : null}
      {/* أرقام الطوارئ متاحة دائماً، حتى في إصدار قديم */}
      {FALLBACK_REFERRAL.contacts.map((contact) => (
        <Button key={contact.phoneNumber} label={`${contact.label}: ${contact.phoneNumber}`} variant="ghost" onPress={() => Linking.openURL(`tel:${contact.phoneNumber}`)} />
      ))}
    </View>
  );
}
