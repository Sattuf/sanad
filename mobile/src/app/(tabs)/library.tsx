import Ionicons from "@expo/vector-icons/Ionicons";
import { isPlayable, libraryApi, youTubeUrl } from "@sanad/shared/api/library";
import type { AudioCategory, AudioTrack } from "@sanad/shared/api/types";
import { ar } from "@sanad/shared/i18n/ar";
import { formatDuration } from "@sanad/shared/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, TextInput, View } from "react-native";
import { AppText, Banner, Button, Card, Screen } from "@/components/ui";
import { api, ApiError, mediaUrl } from "@/lib/api";
import { WEB_BASE_URL } from "@/lib/links";
import { usePlayer } from "@/lib/player";
import { useSignedIn } from "@/lib/queries";
import { fonts, radius, space, useColors } from "@/theme";

const library = libraryApi(api);
type Filter = AudioCategory | "favorites" | null;
const FILTERS: { value: Filter; label: string }[] = [
  { value: null, label: "الكل" },
  { value: "QuranRecitation", label: ar.audioCategory.QuranRecitation },
  { value: "Dua", label: ar.audioCategory.Dua },
  { value: "Adhkar", label: ar.audioCategory.Adhkar },
  { value: "favorites", label: "المفضلة" },
];

export default function LibraryScreen() {
  const signedIn = useSignedIn();
  if (!signedIn) {
    return (
      <Screen>
        <AppText variant="title">المكتبة الصوتية</AppText>
        <Card>
          <AppText>تلاوات وأدعية وأذكار من مصادر موثوقة، تستمع إليها حتى وشاشتك مقفلة.</AppText>
          <AppText variant="muted">المكتبة متاحة بحساب مجاني.</AppText>
        </Card>
        <Button label="الدخول أو إنشاء حساب" onPress={() => router.push("/auth/login")} />
      </Screen>
    );
  }
  return <Library />;
}

function Library() {
  const c = useColors();
  const [filter, setFilter] = useState<Filter>(null);
  const [search, setSearch] = useState("");
  const category = filter === "favorites" ? null : filter;
  const tracks = useQuery({ queryKey: ["library", category, search.trim()], queryFn: () => library.tracks(category, search), enabled: filter !== "favorites" });
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: library.favorites });
  const list = filter === "favorites" ? favorites : tracks;
  const favoriteIds = new Set((favorites.data ?? []).map((t) => t.id));

  return (
    <Screen>
      <TextInput
        accessibilityLabel="بحث في المكتبة"
        placeholder="ابحث بالعنوان أو المصدر"
        placeholderTextColor={c.muted}
        value={search}
        onChangeText={setSearch}
        style={{ minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: c.surface, color: c.text, fontFamily: fonts.body, textAlign: "right" }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.value)}
              style={{ paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.xl, borderWidth: 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.surface }}
            >
              <AppText style={{ color: active ? c.primaryContrast : c.text }}>{f.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {list.isLoading ? <ActivityIndicator color={c.primary} /> : null}
      {list.isError ? <Banner tone="danger">{list.error instanceof ApiError ? list.error.friendly : "تعذّر تحميل المكتبة."}</Banner> : null}
      {list.data && list.data.length === 0 ? (
        <AppText variant="muted">{filter === "favorites" ? "لم تضف شيئاً للمفضلة بعد." : "لا نتائج."}</AppText>
      ) : null}
      {list.data
        ?.filter((t) => filter !== "favorites" || !search.trim() || t.title.includes(search.trim()))
        .map((t) => <TrackRow key={t.id} track={t} favorite={favoriteIds.has(t.id)} />)}
    </Screen>
  );
}

function TrackRow({ track, favorite }: { track: AudioTrack; favorite: boolean }) {
  const c = useColors();
  const qc = useQueryClient();
  const { track: current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;
  const toggleFavorite = useMutation({
    mutationFn: () => (favorite ? library.removeFavorite(track.id) : library.addFavorite(track.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
  const share = useMutation({
    mutationFn: () => library.shareLink(track.id),
    onSuccess: (link) => Share.share({ message: `${track.title} — استمع في سند:\n${WEB_BASE_URL}${link.publicPath}` }),
  });

  const onPlay = () => {
    if (!isPlayable(track)) {
      const url = youTubeUrl(track);
      if (url) void Linking.openURL(url);
      return;
    }
    if (isCurrent) toggle();
    else void play({ id: track.id, title: track.title, subtitle: track.sourceLabel, uri: mediaUrl(track.audioUrl!) });
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${isCurrent && playing ? "إيقاف" : "تشغيل"} ${track.title}`} onPress={onPlay} hitSlop={8}>
          <Ionicons
            name={!isPlayable(track) ? "logo-youtube" : isCurrent && playing ? "pause-circle" : "play-circle"}
            size={44}
            color={!isPlayable(track) ? c.danger : c.primary}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{track.title}</AppText>
          <AppText variant="muted">{`${ar.audioCategory[track.category]} · ${track.sourceLabel}${track.durationSeconds ? ` · ${formatDuration(track.durationSeconds)}` : ""}`}</AppText>
        </View>
      </View>
      {track.description ? <AppText variant="muted">{track.description}</AppText> : null}
      <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={favorite ? "إزالة من المفضلة" : "أضف للمفضلة"} onPress={() => toggleFavorite.mutate()} disabled={toggleFavorite.isPending} hitSlop={8}>
          <Ionicons name={favorite ? "heart" : "heart-outline"} size={24} color={favorite ? c.danger : c.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="مشاركة" onPress={() => share.mutate()} disabled={share.isPending} hitSlop={8}>
          <Ionicons name="share-outline" size={24} color={c.muted} />
        </Pressable>
      </View>
    </Card>
  );
}
