using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Infrastructure.Storage;

namespace Sanad.Infrastructure.Library;

/// <summary>
/// كتالوج المصادر القرآنية المعتمدة: mp3quran.net (سور كاملة بقرّاء وروايات)، everyayah.com (آيات منفردة)،
/// hisnmuslim.com (أذكار حصن المسلم). يُحفظ الكتالوج في الذاكرة 12 ساعة؛ وإن تعذّر مصدر يُعاد المحاولة بعد 5 دقائق
/// وتبقى المصادر الأخرى متاحة. كل رابط تنزيل يُبنى هنا من بيانات الكتالوج، لا من مدخلات المستخدم.
/// </summary>
public sealed class TrustedLibraryCatalog(IHttpClientFactory httpFactory, IOptions<StorageOptions> storage, ILogger<TrustedLibraryCatalog> logger)
    : ILibraryCatalog, IDisposable
{
    private static readonly Uri Mp3QuranReciters = new("https://www.mp3quran.net/api/v3/reciters?language=ar");
    private static readonly Uri Mp3QuranSuwar = new("https://www.mp3quran.net/api/v3/suwar?language=ar");
    private static readonly Uri EveryAyahRecitations = new("https://everyayah.com/data/recitations.js");
    private static readonly Uri HisnMuslimIndex = new("https://www.hisnmuslim.com/api/ar/husn_ar.json");
    private static readonly TimeSpan CacheFor = TimeSpan.FromHours(12);
    private static readonly TimeSpan RetryUnavailableAfter = TimeSpan.FromMinutes(5);
    private const long MaxAyahFileBytes = 10 * 1024 * 1024;
    private const long MaxIndexBytes = 5 * 1024 * 1024;

    private sealed record Moshaf(int ReciterId, string ReciterName, int Id, string Name, Uri Server, IReadOnlySet<int> Surahs);
    private sealed record Adhkar(int Id, string Title, Uri Audio);

    private sealed record Snapshot(IReadOnlyList<CatalogSurahDto> Surahs, IReadOnlyList<CatalogReciterDto> Reciters, IReadOnlyList<Moshaf> Moshafs,
        IReadOnlyList<CatalogAyahReciterDto> AyahReciters, IReadOnlyList<Adhkar> Adhkar, IReadOnlyList<string> Unavailable, DateTimeOffset LoadedAt);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private Snapshot? _snapshot;

    private long MaxImportBytes => storage.Value.MaxImportedAudioMegabytes * 1024L * 1024L;

    public void Dispose() => _gate.Dispose();

    public async Task<LibraryCatalogDto> GetCatalogAsync(CancellationToken ct)
    {
        var s = await SnapshotAsync(ct);
        return new LibraryCatalogDto(s.Surahs, s.Reciters, s.AyahReciters, s.Adhkar.Select(a => new CatalogAdhkarDto(a.Id, a.Title)).ToList(),
            s.Unavailable, []);
    }

    public async Task<CatalogAudio> FetchSurahAsync(int reciterId, int moshafId, int surah, CancellationToken ct)
    {
        var s = await SnapshotAsync(ct);
        var moshaf = s.Moshafs.FirstOrDefault(m => m.ReciterId == reciterId && m.Id == moshafId)
            ?? throw new RequestValidationException("moshafId", "هذه الرواية غير متاحة لهذا القارئ.");
        if (!moshaf.Surahs.Contains(surah)) throw new RequestValidationException("surah", "هذه السورة غير متاحة بصوت هذا القارئ.");

        var url = new Uri(moshaf.Server, $"{surah:000}.mp3");
        var file = await TrustedSources.DownloadToTempAsync(Http(), url, MaxImportBytes, ct);
        return Measure(file, $"سورة {SurahName(s, surah)}", $"{moshaf.ReciterName} — {moshaf.Name}", url.ToString());
    }

    public async Task<CatalogAudio> FetchAyatAsync(string ayahReciterId, int surah, int fromAyah, int toAyah, CancellationToken ct)
    {
        var s = await SnapshotAsync(ct);
        var reciter = s.AyahReciters.FirstOrDefault(r => r.Id == ayahReciterId)
            ?? throw new RequestValidationException("ayahReciterId", "القارئ غير موجود في الكتالوج.");
        if (surah is < 1 or > 114 || fromAyah < 1 || toAyah < fromAyah || toAyah > QuranAyahCounts.Of(surah) || toAyah - fromAyah >= QuranAyahCounts.MaxAyatPerImport)
            throw new RequestValidationException("toAyah", "نطاق الآيات غير صحيح.");

        var output = TrustedSources.CreateTempFile();
        try
        {
            var http = Http();
            var sampleRate = 0;
            double seconds = 0;
            for (var ayah = fromAyah; ayah <= toAyah; ayah++)
            {
                await using var part = await TrustedSources.DownloadToTempAsync(http, AyahUrl(reciter.Id, surah, ayah), MaxAyahFileBytes, ct);
                var scan = ScanOrReject(part, output);
                if (sampleRate != 0 && scan.SampleRate != sampleRate) throw new ExternalSourceException("ملفات الآيات بصيغ مختلفة ولا يمكن دمجها.");
                sampleRate = scan.SampleRate;
                seconds += scan.DurationSeconds;
            }
            await output.FlushAsync(ct);
            output.Position = 0;

            var name = SurahName(s, surah);
            var title = fromAyah == toAyah ? $"{name} — الآية {fromAyah}" : $"{name} — الآيات {fromAyah}–{toAyah}";
            var sourceUrl = fromAyah == toAyah
                ? AyahUrl(reciter.Id, surah, fromAyah).ToString()
                : $"https://everyayah.com/data/{reciter.Id}/#{surah:000}{fromAyah:000}-{surah:000}{toAyah:000}";
            return new CatalogAudio(output, ToSeconds(seconds), title, $"{reciter.Name} — everyayah.com", sourceUrl);
        }
        catch
        {
            await output.DisposeAsync();
            throw;
        }
    }

    public async Task<CatalogAudio> FetchAdhkarAsync(int adhkarId, CancellationToken ct)
    {
        var s = await SnapshotAsync(ct);
        var entry = s.Adhkar.FirstOrDefault(a => a.Id == adhkarId) ?? throw new RequestValidationException("adhkarId", "الذكر غير موجود في الفهرس.");
        var file = await TrustedSources.DownloadToTempAsync(Http(), entry.Audio, MaxImportBytes, ct);
        return Measure(file, entry.Title, "حصن المسلم — hisnmuslim.com", entry.Audio.ToString());
    }

    private static Uri AyahUrl(string folder, int surah, int ayah) => new($"https://everyayah.com/data/{folder}/{surah:000}{ayah:000}.mp3");

    private static CatalogAudio Measure(FileStream file, string title, string sourceLabel, string sourceUrl)
    {
        try
        {
            var scan = ScanOrReject(file, copyTo: null);
            file.Position = 0;
            return new CatalogAudio(file, ToSeconds(scan.DurationSeconds), title, sourceLabel, sourceUrl);
        }
        catch
        {
            file.Dispose();
            throw;
        }
    }

    private static Mp3ScanResult ScanOrReject(Stream file, Stream? copyTo)
    {
        try
        {
            return Mp3Frames.Scan(file, copyTo);
        }
        catch (InvalidDataException)
        {
            throw new ExternalSourceException("الملف الوارد من المصدر ليس MP3 صالحاً.");
        }
    }

    private static int ToSeconds(double seconds) => Math.Max(1, (int)Math.Round(seconds));

    private static string SurahName(Snapshot s, int surah) => s.Surahs[surah - 1].Name;

    private HttpClient Http() => httpFactory.CreateClient(TrustedSources.HttpClientName);

    // ── تحميل الكتالوج ─────────────────────────────────────────────────────────
    private async Task<Snapshot> SnapshotAsync(CancellationToken ct)
    {
        if (IsFresh(_snapshot)) return _snapshot!;
        await _gate.WaitAsync(ct);
        try
        {
            if (!IsFresh(_snapshot)) _snapshot = await LoadAsync(ct);
            return _snapshot!;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static bool IsFresh(Snapshot? s) =>
        s is not null && DateTimeOffset.UtcNow - s.LoadedAt < (s.Unavailable.Count == 0 ? CacheFor : RetryUnavailableAfter);

    private async Task<Snapshot> LoadAsync(CancellationToken ct)
    {
        var unavailable = new List<string>();
        var surahNames = await TryLoadAsync("mp3quran.net", unavailable, () => LoadSurahNamesAsync(ct), new Dictionary<int, string>());
        var moshafs = await TryLoadAsync("mp3quran.net", unavailable, () => LoadMoshafsAsync(ct), []);
        var ayahReciters = await TryLoadAsync("everyayah.com", unavailable, () => LoadAyahRecitersAsync(ct), []);
        var adhkar = await TryLoadAsync("hisnmuslim.com", unavailable, () => LoadAdhkarAsync(ct), []);

        var surahs = Enumerable.Range(1, 114)
            .Select(n => new CatalogSurahDto(n, surahNames.TryGetValue(n, out var name) ? name : $"سورة رقم {n}", QuranAyahCounts.Of(n)))
            .ToList();
        var reciters = moshafs.GroupBy(m => (m.ReciterId, m.ReciterName))
            .Select(g => new CatalogReciterDto(g.Key.ReciterId, g.Key.ReciterName,
                g.Select(m => new CatalogMoshafDto(m.Id, m.Name, m.Surahs.Order().ToList())).ToList()))
            .OrderBy(r => r.Name, StringComparer.Ordinal)
            .ToList();
        return new Snapshot(surahs, reciters, moshafs, ayahReciters, adhkar, unavailable.Distinct().ToList(), DateTimeOffset.UtcNow);
    }

    private async Task<T> TryLoadAsync<T>(string source, List<string> unavailable, Func<Task<T>> load, T fallback)
    {
        try
        {
            return await load();
        }
        catch (Exception ex) when (ex is ExternalSourceException or JsonException or InvalidOperationException or KeyNotFoundException or FormatException)
        {
            logger.LogWarning(ex, "Library catalog source {Source} unavailable", source);
            unavailable.Add(source);
            return fallback;
        }
    }

    private async Task<JsonDocument> GetJsonAsync(Uri uri, CancellationToken ct)
    {
        await using var file = await TrustedSources.DownloadToTempAsync(Http(), uri, MaxIndexBytes, ct);
        return await JsonDocument.ParseAsync(file, cancellationToken: ct);
    }

    private async Task<Dictionary<int, string>> LoadSurahNamesAsync(CancellationToken ct)
    {
        using var doc = await GetJsonAsync(Mp3QuranSuwar, ct);
        return doc.RootElement.GetProperty("suwar").EnumerateArray()
            .Select(s => (Id: s.GetProperty("id").GetInt32(), Name: s.GetProperty("name").GetString()?.Trim()))
            .Where(s => s.Id is >= 1 and <= 114 && !string.IsNullOrEmpty(s.Name))
            .ToDictionary(s => s.Id, s => s.Name!);
    }

    private async Task<List<Moshaf>> LoadMoshafsAsync(CancellationToken ct)
    {
        using var doc = await GetJsonAsync(Mp3QuranReciters, ct);
        var result = new List<Moshaf>();
        foreach (var reciter in doc.RootElement.GetProperty("reciters").EnumerateArray())
        {
            var reciterId = reciter.GetProperty("id").GetInt32();
            var reciterName = reciter.GetProperty("name").GetString()?.Trim();
            if (string.IsNullOrEmpty(reciterName) || !reciter.TryGetProperty("moshaf", out var list)) continue;
            foreach (var m in list.EnumerateArray())
            {
                var server = m.GetProperty("server").GetString();
                if (server is null || !Uri.TryCreate(server.EndsWith('/') ? server : server + "/", UriKind.Absolute, out var serverUri)
                    || !TrustedSources.IsAllowed(serverUri)) continue;
                var surahs = (m.GetProperty("surah_list").GetString() ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(x => int.TryParse(x, out var n) ? n : 0).Where(n => n is >= 1 and <= 114).ToHashSet();
                if (surahs.Count == 0) continue;
                result.Add(new Moshaf(reciterId, reciterName, m.GetProperty("id").GetInt32(), m.GetProperty("name").GetString()?.Trim() ?? "", serverUri, surahs));
            }
        }
        return result;
    }

    private async Task<List<CatalogAyahReciterDto>> LoadAyahRecitersAsync(CancellationToken ct)
    {
        using var doc = await GetJsonAsync(EveryAyahRecitations, ct);
        var result = new List<CatalogAyahReciterDto>();
        foreach (var entry in doc.RootElement.EnumerateObject())
        {
            if (entry.Value.ValueKind != JsonValueKind.Object || !entry.Value.TryGetProperty("subfolder", out var folderEl)) continue;
            var folder = folderEl.GetString();
            if (folder is null || folder.Length > 80 || !folder.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.') || folder.Contains("..")) continue;
            var name = entry.Value.TryGetProperty("name", out var n) ? n.GetString() : folder;
            var bitrate = entry.Value.TryGetProperty("bitrate", out var b) ? b.GetString() : null;
            result.Add(new CatalogAyahReciterDto(folder, string.IsNullOrEmpty(bitrate) ? name ?? folder : $"{name} ({bitrate})"));
        }
        return result.DistinctBy(r => r.Id).OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private async Task<List<Adhkar>> LoadAdhkarAsync(CancellationToken ct)
    {
        using var doc = await GetJsonAsync(HisnMuslimIndex, ct);
        var list = doc.RootElement.EnumerateObject().First(p => p.Value.ValueKind == JsonValueKind.Array).Value;
        var result = new List<Adhkar>();
        foreach (var item in list.EnumerateArray())
        {
            var title = item.GetProperty("TITLE").GetString()?.Trim();
            var audio = item.GetProperty("AUDIO_URL").GetString();
            if (string.IsNullOrEmpty(title) || audio is null || !Uri.TryCreate(audio, UriKind.Absolute, out var audioUri)) continue;
            audioUri = TrustedSources.UpgradeToHttps(audioUri);
            if (!TrustedSources.IsAllowed(audioUri)) continue;
            result.Add(new Adhkar(item.GetProperty("ID").GetInt32(), title.Length <= 200 ? title : title[..200], audioUri));
        }
        return result;
    }
}
