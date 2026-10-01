import Ionicons from "@expo/vector-icons/Ionicons";
import { isPlayable, youTubeUrl } from "@sanad/shared/api/library";
import type { AudioTrack } from "@sanad/shared/api/types";
import { formatDateTime } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { AppText, Banner, Button, Card, Screen, Tag } from "@/components/ui";
import { ApiError, mediaUrl } from "@/lib/api";
import { care } from "@/lib/care";
import { usePlayer } from "@/lib/player";
import { space, useColors } from "@/theme";

/**
 * توصياتي: ما أرسله المختص للمستفيد مباشرة — نص توجيه ومقاطع للاستماع.
 * لا تعرض أبداً ملاحظة المختص الخاصة (تلك لا تصل للمستفيد تحت أي ظرف).
 */
export default function RecommendationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["recommendations"], queryFn: care.recommendations });
  const ack = useMutation({ mutationFn: care.acknowledge, onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }) });
  if (isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: c.bg }} color={c.primary} />;
  return (
    <Screen>
      <AppText variant="muted">توجيهات أرسلها مختصك لك مباشرة. هي توجيه عام ومحتوى للاستماع — لا وصفة علاجية ولا جرعات دوائية.</AppText>
      {error ? <Banner tone="danger">{error instanceof ApiError ? error.friendly : "تعذّر التحميل."}</Banner> : null}
      {data?.length === 0 ? <AppText variant="muted">لا توصيات بعد. بعد تأكيد موعدك، قد يرسل لك مختصك توجيهاً أو مقاطع للاستماع.</AppText> : null}
      {data?.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <AppText variant="heading" style={{ flex: 1 }}>
              {r.providerDisplayName}
            </AppText>
            <AppText variant="muted">{formatDateTime(r.recordedAtUtc)}</AppText>
          </View>
          <AppText>{r.guidanceText}</AppText>
          {r.recommendedTracks.length > 0 ? <AppText variant="muted">مقاطع مقترحة للاستماع</AppText> : null}
          {r.recommendedTracks.map((t) => (
            <TrackLine key={t.id} track={t} />
          ))}
          {r.acknowledgedAtUtc ? (
            <Tag label="اطّلعت عليها" tone="success" />
          ) : (
            <Button label="تم الاطّلاع" variant="secondary" busy={ack.isPending && ack.variables === r.id} onPress={() => ack.mutate(r.id)} />
          )}
        </Card>
      ))}
    </Screen>
  );
}

function TrackLine({ track }: { track: AudioTrack }) {
  const c = useColors();
  const { track: current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;
  const onPress = () => {
    if (!isPlayable(track)) {
      const url = youTubeUrl(track);
      if (url) void Linking.openURL(url);
    } else if (isCurrent) toggle();
    else void play({ id: track.id, title: track.title, subtitle: track.sourceLabel, uri: mediaUrl(track.audioUrl!) });
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`تشغيل ${track.title}`} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Ionicons name={!isPlayable(track) ? "logo-youtube" : isCurrent && playing ? "pause-circle" : "play-circle"} size={32} color={c.primary} />
      <AppText style={{ flex: 1 }}>{`${track.title} — ${track.sourceLabel}`}</AppText>
    </Pressable>
  );
}
