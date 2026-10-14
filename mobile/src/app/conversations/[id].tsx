import Ionicons from "@expo/vector-icons/Ionicons";
import { MAX_MESSAGE, REPORT_CATEGORIES } from "@sanad/shared/api/care";
import type { ChatMessage, ReportCategory } from "@sanad/shared/api/types";
import { ar } from "@sanad/shared/i18n/ar";
import { formatTime } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Banner, Button, Card, Chip, Row, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { care } from "@/lib/care";
import { fonts, radius, space, useColors } from "@/theme";

/** المحادثة الإدارية: نص فقط، غير مراقَبة لحظياً، وكل رسالة تمر على كاشف الخطر في الخادم. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: care.conversations });
  const messages = useQuery({ queryKey: ["messages", id], queryFn: () => care.messages(id), refetchInterval: 30_000 });
  const current = conversations.data?.find((x) => x.id === id);
  const active = !current || current.status === "Active";
  const ordered = useMemo(() => [...(messages.data ?? [])].reverse(), [messages.data]);

  const send = useMutation({
    mutationFn: () => care.send(id, body),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.friendly : "تعذّر الإرسال."),
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: current ? current.counterpartDisplayName : "المحادثة",
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="إبلاغ عن المحادثة" onPress={() => setReporting((v) => !v)} hitSlop={10}>
              <Ionicons name="flag-outline" size={22} color={c.danger} />
            </Pressable>
          ),
        }}
      />
      <View style={{ padding: space.md, gap: space.sm }}>
        <Banner tone="info">
          محادثة إدارية لتنسيق الموعد، وليست مراقَبة لحظياً. لا تشارك بيانات حساسة غير لازمة. إن كنت في خطر فاتصل بالطوارئ الآن.
        </Banner>
        <Pressable accessibilityRole="link" onPress={() => router.push("/emergency")}>
          <AppText style={{ color: c.danger, textDecorationLine: "underline" }}>أرقام الطوارئ</AppText>
        </Pressable>
        {reporting ? <ReportForm conversationId={id} onDone={() => setReporting(false)} /> : null}
      </View>
      {messages.isLoading ? <ActivityIndicator color={c.primary} /> : null}
      {messages.isError ? <Banner tone="danger">تعذّر تحميل الرسائل.</Banner> : null}
      <FlatList
        style={{ flex: 1 }}
        inverted
        data={ordered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        renderItem={({ item }) => <Bubble message={item} />}
        ListEmptyComponent={messages.isSuccess ? <AppText variant="muted">لا رسائل بعد. ابدأ بتنسيق تفاصيل موعدك.</AppText> : null}
      />
      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: insets.bottom + space.sm }]}>
        {!active ? <Banner tone="info">هذه المحادثة مقيّدة إدارياً ولا تقبل رسائل جديدة.</Banner> : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
          <TextInput
            accessibilityLabel="رسالتك"
            placeholder="اكتب رسالة إدارية…"
            placeholderTextColor={c.muted}
            multiline
            maxLength={MAX_MESSAGE}
            editable={active}
            value={body}
            onChangeText={setBody}
            style={[styles.input, { borderColor: c.border, backgroundColor: c.bg, color: c.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إرسال"
            disabled={!active || !body.trim() || send.isPending}
            onPress={() => {
              setError(null);
              send.mutate();
            }}
            hitSlop={8}
          >
            {send.isPending ? <ActivityIndicator color={c.primary} /> : <Ionicons name="send" size={28} color={!active || !body.trim() ? c.muted : c.primary} style={{ transform: [{ scaleX: -1 }] }} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const c = useColors();
  const mine = message.isMine;
  return (
    <View style={[styles.bubble, { alignSelf: mine ? "flex-end" : "flex-start", backgroundColor: mine ? c.primary : c.surface2 }]}>
      <AppText style={{ color: mine ? c.primaryContrast : c.text }}>{message.body}</AppText>
      <AppText style={{ color: mine ? c.primaryContrast : c.muted, fontSize: 11, lineHeight: 16, opacity: 0.85 }}>{formatTime(message.sentAtUtc)}</AppText>
    </View>
  );
}

function ReportForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [category, setCategory] = useState<ReportCategory>("Harassment");
  const [description, setDescription] = useState("");
  const report = useMutation({ mutationFn: () => care.report(conversationId, category, description) });
  if (report.isSuccess)
    return (
      <Card>
        <AppText>وصل بلاغك، وسيراجعه فريق التنسيق.</AppText>
        <Button label="إغلاق" variant="ghost" onPress={onDone} />
      </Card>
    );
  return (
    <Card>
      <AppText variant="heading">الإبلاغ عن هذه المحادثة</AppText>
      <Row>
        {REPORT_CATEGORIES.map((cat) => (
          <Chip key={cat} label={ar.reportCategory[cat]} active={category === cat} onPress={() => setCategory(cat)} />
        ))}
      </Row>
      <TextField label="وصف مختصر (اختياري، يُحفظ مشفّراً)" multiline maxLength={3000} value={description} onChangeText={setDescription} />
      {report.error ? <Banner tone="danger">{report.error instanceof ApiError ? report.error.friendly : "تعذّر الإرسال"}</Banner> : null}
      <Button label="إرسال البلاغ" busy={report.isPending} onPress={() => report.mutate()} />
      <Button label="إلغاء" variant="ghost" onPress={onDone} />
    </Card>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "80%", borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: 10, fontFamily: fonts.body, fontSize: 16, textAlign: "right" },
});
