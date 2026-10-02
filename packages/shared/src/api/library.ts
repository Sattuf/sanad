import type { ApiClient } from "./core";
import type { AudioCategory, AudioTrack, SharedLink } from "./types";

/** المكتبة الصوتية (تتطلب حساباً) — مشتركة بين الويب والجوال. */
export function libraryApi(api: ApiClient["api"]) {
  return {
    tracks: (category?: AudioCategory | null, q?: string) => {
      const qs = new URLSearchParams();
      if (category) qs.set("category", category);
      if (q?.trim()) qs.set("q", q.trim());
      const s = qs.toString();
      return api.get<AudioTrack[]>(`/api/v1/library${s ? `?${s}` : ""}`);
    },
    favorites: () => api.get<AudioTrack[]>("/api/v1/me/favorites"),
    addFavorite: (trackId: string) => api.post<void>("/api/v1/me/favorites", { audioTrackId: trackId }),
    removeFavorite: (trackId: string) => api.del<void>(`/api/v1/me/favorites/${trackId}`),
    shareLink: (trackId: string) => api.post<SharedLink>(`/api/v1/library/tracks/${trackId}/share-link`),
  };
}

/** المقاطع المخزّنة تُشغَّل في التطبيق؛ مقاطع YouTube تُفتح في مصدرها. */
export const isPlayable = (t: AudioTrack) => t.mediaKind === "StoredAudio" && !!t.audioUrl;

export const youTubeUrl = (t: AudioTrack) => (t.youTubeVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(t.youTubeVideoId)}` : t.sourceUrl);
