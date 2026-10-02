import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { parseTime, slots, type SlotId } from "@sanad/shared/content/wird";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Switch, View } from "react-native";
import { AppText, Banner, Button, Card, Screen } from "@/components/ui";
import { applyReminders, DISABLED, ensureNotificationPermission, loadReminders, type ReminderTimes } from "@/lib/reminders";
import { space, useColors } from "@/theme";

const toDate = (time: string) => {
  const t = parseTime(time) ?? { hour: 6, minute: 30 };
  const d = new Date();
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
};
const toTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** تذكير الأذكار: ثلاثة أوقات يومية بتوقيت الجهاز، تصل والتطبيق مغلق ودون اتصال. */
export default function RemindersScreen() {
  const c = useColors();
  const [times, setTimes] = useState<ReminderTimes>(DISABLED);
  const [editing, setEditing] = useState<SlotId | null>(null);
  const [denied, setDenied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadReminders().then(setTimes);
  }, []);

  const update = async (next: ReminderTimes) => {
    setSaved(false);
    if (Object.values(next).some(Boolean) && !(await ensureNotificationPermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setTimes(next);
    await applyReminders(next);
    setSaved(true);
  };

  const onPick = (slot: SlotId) => (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setEditing(null);
    if (event.type === "set" && date) void update({ ...times, [slot]: toTime(date) });
  };

  return (
    <Screen>
      <AppText variant="muted">نذكّرك بوردك في وقته، حتى والتطبيق مغلق ودون إنترنت. التذكير على جهازك فقط ولا يحمل أي بيانات شخصية.</AppText>
      {denied ? (
        <Banner tone="danger">الإشعارات غير مسموحة لسند. فعّلها من إعدادات الجهاز ثم عد هنا.</Banner>
      ) : null}
      {denied ? <Button label="فتح الإعدادات" variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
      {slots.map((slot) => {
        const time = times[slot.id];
        return (
          <Card key={slot.id}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText variant="heading">{slot.label}</AppText>
              <Switch
                accessibilityLabel={slot.label}
                value={!!time}
                onValueChange={(on) => void update({ ...times, [slot.id]: on ? slot.defaultTime : null })}
                trackColor={{ true: c.primary, false: c.border }}
              />
            </View>
            {time ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`تغيير وقت ${slot.label}`} onPress={() => setEditing(editing === slot.id ? null : slot.id)} style={{ paddingVertical: space.xs }}>
                <AppText style={{ color: c.primary }}>{`كل يوم الساعة ${time} — تغيير`}</AppText>
              </Pressable>
            ) : null}
            {editing === slot.id && time ? (
              <DateTimePicker value={toDate(time)} mode="time" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onPick(slot.id)} />
            ) : null}
          </Card>
        );
      })}
      {saved ? <Banner tone="success">حُفظت أوقات التذكير.</Banner> : null}
    </Screen>
  );
}
