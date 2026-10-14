import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import type { AudioCategory, AudioTrackAdmin, LibraryCatalog, UploadedFile } from "@sanad/shared/api/types";
import { Banner, Button, Card, Checkbox, ErrorState, Field, Input, Loading, Select, Textarea } from "../../components/ui";
import { cx } from "../../lib/cx";

// ── إضافة مقاطع المكتبة: مصادر معتمدة (ADR-0015) + YouTube من قناة معتمدة + رفع يدوي ─────────
type Source = "ruqyah" | "surah" | "ayat" | "adhkar" | "youtube" | "upload";

const sourceLabels: Record<Source, string> = {
  ruqyah: "آيات الرقية",
  surah: "سورة كاملة",
  ayat: "آيات محددة",
  adhkar: "حصن المسلم",
  youtube: "YouTube",
  upload: "رفع ملف",
};

const sourcesByFolder: Record<AudioCategory, Source[]> = {
  QuranRecitation: ["ruqyah", "surah", "ayat", "youtube", "upload"],
  Dua: ["adhkar", "ayat", "youtube", "upload"],
  Adhkar: ["adhkar", "youtube", "upload"],
};

/**
 * قائمة مقترحة لآيات الرقية المشهورة في كتب الرقية الشرعية. لا تُستورد تلقائياً:
 * مدير المحتوى يراجعها ويختار منها، وكل مقطع يُستورد مستقلاً ويمر على بوابة النشر نفسها.
 */
const ruqyahPresets = [
  { title: "سورة الفاتحة", surah: 1, from: 1, to: 7 },
  { title: "أول سورة البقرة", surah: 2, from: 1, to: 5 },
  { title: "آية الكرسي", surah: 2, from: 255, to: 255 },
  { title: "خواتيم سورة البقرة", surah: 2, from: 285, to: 286 },
  { title: "الأعراف (54–56)", surah: 7, from: 54, to: 56 },
  { title: "الأعراف (117–122)", surah: 7, from: 117, to: 122 },
  { title: "يونس (79–82)", surah: 10, from: 79, to: 82 },
  { title: "طه (65–69)", surah: 20, from: 65, to: 69 },
  { title: "المؤمنون (115–118)", surah: 23, from: 115, to: 118 },
  { title: "الصافات (1–10)", surah: 37, from: 1, to: 10 },
  { title: "الأحقاف (29–32)", surah: 46, from: 29, to: 32 },
  { title: "الرحمن (33–36)", surah: 55, from: 33, to: 36 },
  { title: "الحشر (21–24)", surah: 59, from: 21, to: 24 },
  { title: "الجن (1–9)", surah: 72, from: 1, to: 9 },
  { title: "سورة الإخلاص", surah: 112, from: 1, to: 4 },
  { title: "سورة الفلق", surah: 113, from: 1, to: 5 },
  { title: "سورة الناس", surah: 114, from: 1, to: 6 },
];

const DEFAULT_AYAH_RECITER = "Alafasy_128kbps";

interface ImportRequest {
  kind: "Surah" | "Ayat" | "Adhkar";
  reciterId?: number; moshafId?: number; surah?: number; fromAyah?: number; toAyah?: number; ayahReciterId?: string; adhkarId?: number;
  title?: string | null;
}

interface SourceProps {
  folder: AudioCategory;
  publish: boolean;
  added: (track: AudioTrackAdmin) => void;
  failed: (err: unknown) => void;
  notify: (tone: "success" | "warning" | "danger", text: string) => void;
  clear: () => void;
}

const importTrack = (folder: AudioCategory, req: ImportRequest, publish: boolean) =>
  api.post<AudioTrackAdmin>("/api/v1/admin/library/catalog/import", { ...req, category: folder, publish });

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.friendly : fallback);

export function LibraryAddPanel({ folder, folderLabel, sourceHint, onAdded }: { folder: AudioCategory; folderLabel: string; sourceHint: string; onAdded: () => void }) {
  const sources = sourcesByFolder[folder];
  const [chosen, setChosen] = useState<Source>(sources[0]);
  const source = sources.includes(chosen) ? chosen : sources[0];
  const [publish, setPublish] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const catalog = useQuery({
    queryKey: ["library-catalog"],
    queryFn: () => api.get<LibraryCatalog>("/api/v1/admin/library/catalog"),
    staleTime: 60 * 60 * 1000,
    enabled: source !== "upload",
  });

  const props: SourceProps = {
    folder,
    publish,
    added: (track) => {
      onAdded();
      setMessage({
        tone: "success",
        text: track.isPublished
          ? `نُشر «${track.title}» في «${folderLabel}» ويظهر الآن في مكتبة الرقية.`
          : `حُفظ «${track.title}» كمسودة في «${folderLabel}». لن يظهر للمستخدمين حتى تضغط «نشر».`,
      });
    },
    failed: (err) => { onAdded(); setMessage({ tone: "danger", text: errorText(err, "تعذّرت الإضافة.") }); },
    notify: (tone, text) => { onAdded(); setMessage({ tone, text }); },
    clear: () => setMessage(null),
  };

  const body = () => {
    if (source === "upload") return <UploadSource {...props} sourceHint={sourceHint} />;
    if (catalog.isLoading) return <Loading />;
    if (catalog.error || !catalog.data) return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
    switch (source) {
      case "ruqyah": return <RuqyahSource {...props} catalog={catalog.data} />;
      case "surah": return <SurahSource {...props} catalog={catalog.data} />;
      case "ayat": return <AyatSource {...props} catalog={catalog.data} />;
      case "adhkar": return <AdhkarSource {...props} catalog={catalog.data} />;
      case "youtube": return <YouTubeSource {...props} catalog={catalog.data} />;
    }
  };

  return (
    <Card>
      <h2 className="font-bold">إضافة إلى «{folderLabel}»</h2>
      <div className="mt-3 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="مصدر المقطع">
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={source === s}
            onClick={() => { setChosen(s); setMessage(null); }}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", source === s ? "bg-primary text-primary-contrast" : "text-muted hover:text-text")}
          >
            {sourceLabels[s]}
          </button>
        ))}
      </div>
      {message && <div className="mt-3"><Banner tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Banner></div>}
      {source !== "upload" && !!catalog.data?.unavailable.length && (
        <div className="mt-3"><Banner tone="warning">تعذّر الوصول الآن إلى: {catalog.data.unavailable.join("، ")}. بقية المصادر تعمل، وسيُعاد المحاولة تلقائياً.</Banner></div>
      )}
      <div className="mt-3">
        <Checkbox id="lib-publish" label="نشر مباشرة في مكتبة الرقية" hint="ألغِ التحديد لحفظه مسودة تستمع إليها قبل النشر." checked={publish} onChange={setPublish} />
      </div>
      <div className="mt-4">{body()}</div>
    </Card>
  );
}

function PendingNote({ text = "جارٍ التنزيل من المصدر والتحقق من الملف…" }: { text?: string }) {
  return <p className="text-xs text-muted" role="status">{text}</p>;
}

function AyahReciterSelect({ id, catalog, value, onChange }: { id: string; catalog: LibraryCatalog; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="القارئ" htmlFor={id} hint="تلاوات آية بآية من everyayah.com">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {catalog.ayahReciters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
    </Field>
  );
}

const defaultAyahReciter = (catalog: LibraryCatalog) =>
  catalog.ayahReciters.find((r) => r.id === DEFAULT_AYAH_RECITER)?.id ?? catalog.ayahReciters[0]?.id ?? "";

// ── آيات الرقية ──────────────────────────────────────────────────────────────
type PresetStatus = "running" | "done" | "exists" | "failed";

function RuqyahSource({ catalog, folder, publish, notify, clear }: SourceProps & { catalog: LibraryCatalog }) {
  const [reciter, setReciter] = useState(() => defaultAyahReciter(catalog));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(ruqyahPresets.map((_, i) => i)));
  const [status, setStatus] = useState<Record<number, PresetStatus>>({});
  const [busy, setBusy] = useState(false);
  if (!catalog.ayahReciters.length) return <Banner tone="warning">كتالوج الآيات (everyayah.com) غير متاح الآن. حاول بعد قليل.</Banner>;

  const toggle = (i: number, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(i); else n.delete(i); return n; });
  const run = async () => {
    clear();
    setBusy(true);
    setStatus({});
    const counts = { done: 0, exists: 0, failed: 0 };
    for (const i of [...selected].sort((a, b) => a - b)) {
      const p = ruqyahPresets[i];
      setStatus((s) => ({ ...s, [i]: "running" }));
      let result: keyof typeof counts;
      try {
        await importTrack(folder, { kind: "Ayat", ayahReciterId: reciter, surah: p.surah, fromAyah: p.from, toAyah: p.to, title: p.title }, publish);
        result = "done";
      } catch (err) {
        result = err instanceof ApiError && err.status === 409 ? "exists" : "failed";
      }
      counts[result]++;
      setStatus((s) => ({ ...s, [i]: result }));
    }
    setBusy(false);
    const parts = [`أُضيف ${counts.done}`, counts.exists ? `${counts.exists} موجود مسبقاً` : "", counts.failed ? `تعذّر ${counts.failed}` : ""].filter(Boolean);
    notify(counts.failed ? "warning" : "success", `${parts.join(" · ")}.${counts.failed ? " أعد المحاولة للمقاطع المتعذّرة." : ""}`);
  };

  const icon: Record<PresetStatus, string> = { running: "⏳", done: "✅", exists: "☑️", failed: "⚠️" };
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">قائمة مقترحة لآيات الرقية المشهورة — راجعها واختر ما يناسب. كل بند يُضاف مقطعاً مستقلاً بصوت القارئ المختار.</p>
      <AyahReciterSelect id="rq-reciter" catalog={catalog} value={reciter} onChange={setReciter} />
      <div className="flex gap-3 text-sm">
        <button type="button" className="text-primary underline" onClick={() => setSelected(new Set(ruqyahPresets.map((_, i) => i)))}>تحديد الكل</button>
        <button type="button" className="text-muted underline" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
      </div>
      <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-border p-2">
        {ruqyahPresets.map((p, i) => (
          <li key={p.title} className="flex items-center justify-between gap-2">
            <Checkbox id={`rq-${i}`} label={p.title} checked={selected.has(i)} onChange={(v) => toggle(i, v)} />
            {status[i] && <span aria-label={status[i]}>{icon[status[i]]}</span>}
          </li>
        ))}
      </ul>
      <div><Button type="button" busy={busy} disabled={busy || !selected.size || !reciter} onClick={() => void run()}>استيراد المحدد ({selected.size})</Button></div>
      {busy && <PendingNote text="يُستورد بنداً بنداً… لا تغلق الصفحة." />}
      <p className="text-xs text-muted">✅ أُضيف · ☑️ موجود مسبقاً · ⚠️ تعذّر</p>
    </div>
  );
}

// ── سورة كاملة ───────────────────────────────────────────────────────────────
function SurahSource({ catalog, folder, publish, added, failed, clear }: SourceProps & { catalog: LibraryCatalog }) {
  const [filter, setFilter] = useState("");
  const [reciterId, setReciterId] = useState<number | null>(null);
  const [moshafId, setMoshafId] = useState<number | null>(null);
  const [surah, setSurah] = useState(1);
  const [title, setTitle] = useState("");
  const reciter = catalog.surahReciters.find((r) => r.id === reciterId);
  const moshaf = reciter?.moshafs.find((m) => m.id === moshafId) ?? reciter?.moshafs[0];
  const selectedSurah = moshaf?.surahs.includes(surah) ? surah : moshaf?.surahs[0];
  const visible = catalog.surahReciters.filter((r) => r.id === reciterId || r.name.includes(filter.trim()));
  const run = useMutation({
    mutationFn: () => importTrack(folder, { kind: "Surah", reciterId: reciter!.id, moshafId: moshaf!.id, surah: selectedSurah!, title: title.trim() || null }, publish),
    onSuccess: (track) => { added(track); setTitle(""); },
    onError: failed,
  });
  if (!catalog.surahReciters.length) return <Banner tone="warning">كتالوج السور (mp3quran.net) غير متاح الآن. حاول بعد قليل.</Banner>;

  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); clear(); run.mutate(); }}>
      <Field label="القارئ" htmlFor="sr-reciter" hint={`${catalog.surahReciters.length} قارئاً من mp3quran.net`}>
        <Input aria-label="ابحث باسم القارئ" placeholder="ابحث باسم القارئ، مثلاً: العفاسي" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Select id="sr-reciter" value={reciterId ?? ""} onChange={(e) => { setReciterId(e.target.value ? Number(e.target.value) : null); setMoshafId(null); }}>
          <option value="">— اختر القارئ ({visible.length}) —</option>
          {visible.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      {reciter && (
        <Field label="الرواية" htmlFor="sr-moshaf">
          <Select id="sr-moshaf" value={moshaf?.id} onChange={(e) => setMoshafId(Number(e.target.value))}>
            {reciter.moshafs.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.surahs.length} سورة)</option>)}
          </Select>
        </Field>
      )}
      {moshaf && (
        <Field label="السورة" htmlFor="sr-surah">
          <Select id="sr-surah" value={selectedSurah} onChange={(e) => setSurah(Number(e.target.value))}>
            {moshaf.surahs.map((n) => <option key={n} value={n}>{n}. {catalog.surahs[n - 1]?.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="العنوان (اختياري)" htmlFor="sr-title" hint="يُملأ تلقائياً: «سورة …»، والمصدر: القارئ والرواية.">
        <Input id="sr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div><Button type="submit" busy={run.isPending} disabled={!moshaf || !selectedSurah || run.isPending}>استيراد السورة</Button></div>
      {run.isPending && <PendingNote text="جارٍ التنزيل من المصدر… السور الطويلة قد تستغرق دقيقة أو أكثر." />}
    </form>
  );
}

// ── آيات محددة ───────────────────────────────────────────────────────────────
function AyatSource({ catalog, folder, publish, added, failed, clear }: SourceProps & { catalog: LibraryCatalog }) {
  const [reciter, setReciter] = useState(() => defaultAyahReciter(catalog));
  const [surah, setSurah] = useState(2);
  const [from, setFrom] = useState(255);
  const [to, setTo] = useState(255);
  const [title, setTitle] = useState("");
  const max = catalog.surahs[surah - 1]?.ayahCount ?? 1;
  const invalid = from < 1 || to < from || to > max || to - from >= 60;
  const run = useMutation({
    mutationFn: () => importTrack(folder, { kind: "Ayat", ayahReciterId: reciter, surah, fromAyah: from, toAyah: to, title: title.trim() || null }, publish),
    onSuccess: (track) => { added(track); setTitle(""); },
    onError: failed,
  });
  if (!catalog.ayahReciters.length) return <Banner tone="warning">كتالوج الآيات (everyayah.com) غير متاح الآن. حاول بعد قليل.</Banner>;

  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); clear(); run.mutate(); }}>
      <AyahReciterSelect id="ay-reciter" catalog={catalog} value={reciter} onChange={setReciter} />
      <Field label="السورة" htmlFor="ay-surah">
        <Select id="ay-surah" value={surah} onChange={(e) => { setSurah(Number(e.target.value)); setFrom(1); setTo(1); }}>
          {catalog.surahs.map((s) => <option key={s.number} value={s.number}>{s.number}. {s.name} ({s.ayahCount} آية)</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="من الآية" htmlFor="ay-from"><Input id="ay-from" type="number" min={1} max={max} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></Field>
        <Field label="إلى الآية" htmlFor="ay-to"><Input id="ay-to" type="number" min={1} max={max} value={to} onChange={(e) => setTo(Number(e.target.value))} /></Field>
      </div>
      {invalid && <p className="text-xs font-semibold text-danger" role="alert">النطاق يجب أن يكون بين 1 و{max}، وبحد أقصى 60 آية.</p>}
      <Field label="العنوان (اختياري)" htmlFor="ay-title" hint="مثلاً: آية الكرسي. إن تُرك فارغاً: «البقرة — الآية 255».">
        <Input id="ay-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div><Button type="submit" busy={run.isPending} disabled={invalid || !reciter || run.isPending}>استيراد الآيات</Button></div>
      {run.isPending && <PendingNote />}
    </form>
  );
}

// ── حصن المسلم ───────────────────────────────────────────────────────────────
function AdhkarSource({ catalog, folder, publish, added, failed, clear }: SourceProps & { catalog: LibraryCatalog }) {
  const [filter, setFilter] = useState("");
  const [id, setId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const visible = catalog.adhkar.filter((a) => a.id === id || a.title.includes(filter.trim()));
  const run = useMutation({
    mutationFn: () => importTrack(folder, { kind: "Adhkar", adhkarId: id!, title: title.trim() || null }, publish),
    onSuccess: (track) => { added(track); setTitle(""); },
    onError: failed,
  });
  if (!catalog.adhkar.length) return <Banner tone="warning">فهرس حصن المسلم (hisnmuslim.com) غير متاح الآن. حاول بعد قليل.</Banner>;

  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); clear(); run.mutate(); }}>
      <Field label="الذكر أو الدعاء" htmlFor="ad-item" hint={`${catalog.adhkar.length} باباً من حصن المسلم`}>
        <Input aria-label="ابحث في حصن المسلم" placeholder="ابحث، مثلاً: الصباح، النوم، الكرب" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Select id="ad-item" value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— اختر ({visible.length}) —</option>
          {visible.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </Select>
      </Field>
      <Field label="العنوان (اختياري)" htmlFor="ad-title" hint="يُملأ تلقائياً من عنوان الباب.">
        <Input id="ad-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div><Button type="submit" busy={run.isPending} disabled={!id || run.isPending}>استيراد</Button></div>
      {run.isPending && <PendingNote />}
    </form>
  );
}

// ── YouTube ─────────────────────────────────────────────────────────────────
function YouTubeSource({ catalog, folder, publish, added, failed, clear }: SourceProps & { catalog: LibraryCatalog }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const channels = catalog.allowedYouTubeChannels;
  const run = useMutation({
    mutationFn: () => api.post<AudioTrackAdmin>("/api/v1/admin/library/youtube", { url: url.trim(), category: folder, title: title.trim() || null, publish }),
    onSuccess: (track) => { added(track); setUrl(""); setTitle(""); },
    onError: failed,
  });
  if (!channels.length)
    return (
      <Banner tone="warning" title="لم تُحدَّد قناة YouTube معتمدة بعد">
        يقبل النظام فيديوهات قناتكم فقط. أضف رابط القناة (مثل https://www.youtube.com/@اسم_القناة) في الإعداد
        <span dir="ltr" className="font-mono"> Library:YouTube:AllowedChannels </span>ثم أعد تشغيل الخادم.
      </Banner>
    );

  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); clear(); run.mutate(); }}>
      <p className="text-sm text-muted">
        القنوات المعتمدة: {channels.map((c) => <span key={c} dir="ltr" className="font-mono">{c} </span>)}
      </p>
      <Field label="رابط الفيديو" htmlFor="yt-url" hint="من زر «مشاركة» في YouTube. يجب أن يكون الفيديو «عاماً» أو «غير مدرج» ومسموحاً بتضمينه.">
        <Input id="yt-url" dir="ltr" placeholder="https://youtu.be/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="العنوان (اختياري)" htmlFor="yt-title" hint="يُملأ تلقائياً من عنوان الفيديو.">
        <Input id="yt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div><Button type="submit" busy={run.isPending} disabled={!url.trim() || run.isPending}>إضافة الفيديو</Button></div>
      <p className="text-xs text-muted">لا يُنزَّل الفيديو: يُعرض بمشغّل YouTube المضمَّن، ولا يُحمَّل شيء من YouTube قبل أن يضغط المستخدم تشغيل.</p>
    </form>
  );
}

// ── رفع ملف من الجهاز ─────────────────────────────────────────────────────────
function UploadSource({ folder, publish, added, failed, clear, sourceHint }: SourceProps & { sourceHint: string }) {
  const [form, setForm] = useState({ title: "", sourceLabel: "", description: "", durationSeconds: 60 });
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const run = useMutation({
    // النشر خطوة ثانية منفصلة على بوابة الخادم نفسها (إعادة فحص النصوص)
    mutationFn: async () => {
      const data = new FormData();
      data.append("file", file!);
      const uploaded = await api.post<UploadedFile>("/api/v1/admin/library/uploads", data);
      const track = await api.post<AudioTrackAdmin>("/api/v1/admin/library/tracks", {
        ...form, category: folder, description: form.description.trim() || null, audioFileId: uploaded.id,
      });
      return publish ? api.post<AudioTrackAdmin>(`/api/v1/admin/library/tracks/${track.id}/publish`) : track;
    },
    onSuccess: (track) => {
      added(track);
      setForm((f) => ({ ...f, title: "", description: "" }));
      setFile(null);
      setInputKey((k) => k + 1);
    },
    onError: failed,
  });
  const readDuration = (f: File) => {
    const url = URL.createObjectURL(f);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setForm((s) => ({ ...s, durationSeconds: Math.max(1, Math.round(audio.duration)) }));
      URL.revokeObjectURL(url);
    };
  };
  const ready = !!file && !!form.title.trim() && !!form.sourceLabel.trim();

  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); clear(); run.mutate(); }}>
      <Field label="ملف الصوت" htmlFor="af" hint="MP3 أو M4A فقط (يُفحص التوقيع الفعلي)، حتى 60 ميجابايت.">
        <label
          htmlFor="af"
          className={cx(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-5 text-center hover:border-primary",
            file ? "border-primary bg-surface-2" : "border-border",
          )}
        >
          <span className="text-2xl" aria-hidden>🎵</span>
          <span className="font-semibold text-primary">{file ? "تغيير الملف" : "اضغط هنا لاختيار المقطع الصوتي"}</span>
          <span className="text-sm text-muted" dir={file ? "ltr" : undefined}>{file ? file.name : "من جهازك"}</span>
        </label>
        <input key={inputKey} id="af" type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" className="sr-only" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) readDuration(f); }} />
      </Field>
      <Field label="العنوان" htmlFor="at"><Input id="at" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="المصدر" htmlFor="as" hint={sourceHint}><Input id="as" value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} /></Field>
      <Field label="وصف (اختياري)" htmlFor="ad"><Textarea id="ad" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="المدة بالثواني" htmlFor="adu" hint="تُملأ تلقائياً من الملف."><Input id="adu" type="number" min={1} value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })} /></Field>
      <div><Button type="submit" busy={run.isPending} disabled={!ready || run.isPending}>{publish ? "رفع ونشر" : "رفع كمسودة"}</Button></div>
    </form>
  );
}
