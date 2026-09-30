import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { useMe } from "../../api/hooks";
import type { AudioCategory, AudioTrack, PublicSharedTrack, SharedLink } from "../../api/types";
import { TrackMedia } from "../../components/TrackMedia";
import { AnimatedLamp } from "../../components/motion/Lamp";
import { Banner, Button, Card, EmptyState, ErrorState, Input, Loading, PageHeader } from "../../components/ui";
import { cx } from "../../lib/cx";
import { Scene } from "../ruqyah/Scene";

const categories: Array<AudioCategory | ""> = ["", "QuranRecitation", "Dua", "Adhkar"];

export function LibraryPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [category, setCategory] = useState<AudioCategory | "">("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (search) qs.set("q", search);

  const tracks = useQuery({ queryKey: ["library", category, search], queryFn: () => api.get<AudioTrack[]>(`/api/v1/library?${qs.toString()}`) });
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => api.get<AudioTrack[]>("/api/v1/me/favorites") });
  const favIds = new Set(favorites.data?.map((f) => f.id));

  return (
    <div>
      <PageHeader
        title="المكتبة الصوتية"
        subtitle="تلاوات وأدعية وأذكار بأصوات القرّاء من مصادر موثوقة، تُراجَع قبل نشرها. اقرأ واستمع بيقين، والشفاء بيد الله وحده."
        actions={
          <div className="flex gap-2">
            {me?.roles.includes("ContentManager") && (
              <Link to={`/staff/library?folder=${category || "QuranRecitation"}`} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">+ إضافة مقطع</Link>
            )}
            <Link to="/favorites" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold">المفضلة</Link>
          </div>
        }
      />
      <Link to="/ruqyah" className="group mb-6 block">
        <Scene theme="mihrab" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ring-1 ring-white/10 transition-all group-hover:ring-lamp-glow/60">
          <div>
            <p className="font-bold">الرقية والتحصين مكتوبةً</p>
            <p className="text-sm text-[#d9d2c3]">آيات الرقية بخط المصحف، وأدعية السنة بتخريجها، مع عدّاد للأذكار.</p>
          </div>
          <span className="text-sm font-semibold text-lamp-glow">افتح ←</span>
        </Scene>
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="التصنيف">
          {categories.map((c) => (
            <button
              key={c || "all"}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", category === c ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
            >
              {c ? t(`audioCategory.${c}`) : "الكل"}
            </button>
          ))}
        </div>
        <form className="flex flex-1 gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
          <label htmlFor="lq" className="sr-only">بحث في المكتبة</label>
          <Input id="lq" placeholder="ابحث بالعنوان أو المصدر" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Button type="submit" variant="secondary">بحث</Button>
        </form>
      </div>
      {tracks.isLoading ? <Loading /> : tracks.error ? <ErrorState error={tracks.error} /> : !tracks.data?.length ? (
        <EmptyState title="لا مقاطع هنا بعد">يضيف فريق المحتوى مقاطع جديدة بعد مراجعتها.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tracks.data.map((track) => <li key={track.id}><TrackCard track={track} isFavorite={favIds.has(track.id)} /></li>)}
        </ul>
      )}
    </div>
  );
}

function TrackCard({ track, isFavorite }: { track: AudioTrack; isFavorite: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fav = useMutation({
    mutationFn: () => (isFavorite ? api.del(`/api/v1/me/favorites/${track.id}`) : api.post("/api/v1/me/favorites", { audioTrackId: track.id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
  const share = useMutation({
    mutationFn: () => api.post<SharedLink>(`/api/v1/library/tracks/${track.id}/share-link`),
    onSuccess: (l) => setLink(`${window.location.origin}${l.publicPath}`),
  });

  return (
    <Card as="article">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{track.title}</h2>
          <p className="text-sm text-muted">{track.sourceLabel} · {t(`audioCategory.${track.category}`)}</p>
        </div>
        <button
          type="button"
          onClick={() => fav.mutate()}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "إزالة من المفضلة" : "أضف للمفضلة"}
          className={cx("text-xl", isFavorite ? "text-lamp" : "text-muted hover:text-lamp")}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
      {track.description && <p className="mt-2 text-sm leading-7 text-muted">{track.description}</p>}
      <div className="mt-3"><TrackMedia track={track} /></div>
      <div className="mt-3">
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="num flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 text-xs">{link}</code>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "نُسخ ✓" : "نسخ الرابط"}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" busy={share.isPending} onClick={() => share.mutate()}>شارك هذا المقطع</Button>
        )}
        {share.error && <p className="mt-1 text-xs text-danger">{share.error instanceof ApiError ? share.error.friendly : "تعذّر إنشاء الرابط"}</p>}
      </div>
    </Card>
  );
}

export function FavoritesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["favorites"], queryFn: () => api.get<AudioTrack[]>("/api/v1/me/favorites") });
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <div>
      <PageHeader title="المفضلة" subtitle="قائمتك الشخصية — لا يراها أحد غيرك." />
      {!data?.length ? <EmptyState title="لم تضف مقاطع بعد"><Link to="/library" className="text-primary underline">تصفّح المكتبة</Link></EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2">{data.map((t) => <li key={t.id}><TrackCard track={t} isFavorite /></li>)}</ul>
      )}
    </div>
  );
}

/**
 * صفحة الاستماع العامة (/public/shared/:code) — بلا مصادقة، بلا أي عنصر من الواجهة المصادَقة،
 * ولا بيانات عن منشئ الرابط. دعوة لطيفة للتسجيل المجاني فقط.
 */
export function PublicSharePage() {
  const { shortCode } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", shortCode],
    queryFn: () => api.get<PublicSharedTrack>(`/api/v1/public/shared/${shortCode}`, { auth: false }),
    retry: false,
  });
  if (isLoading) return <Loading />;
  if (error || !data)
    return <Banner tone="warning" title="الرابط غير متاح">ربما سُحب المقطع من المكتبة. <Link to="/" className="underline">زر سند</Link></Banner>;
  const t = data.track;
  return (
    <div className="flex flex-col items-center text-center">
      <AnimatedLamp size={70} />
      <h1 className="mt-2 text-2xl font-bold">{t.title}</h1>
      <p className="text-muted">{t.sourceLabel}</p>
      {t.description && <p className="mt-3 max-w-md leading-8 text-muted">{t.description}</p>}
      <div className="mt-6 w-full"><TrackMedia track={t} /></div>
      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <p className="font-semibold">المزيد من التلاوات والأدعية في مكتبة سند</p>
        <p className="mt-1 text-sm text-muted">مجانية بالكامل، بلا اشتراكات ولا إعلانات.</p>
        <Link to="/register" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">سجّل مجاناً</Link>
      </div>
    </div>
  );
}
