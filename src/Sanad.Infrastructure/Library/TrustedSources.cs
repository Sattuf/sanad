using Sanad.Application.Common.Exceptions;

namespace Sanad.Infrastructure.Library;

public sealed class LibrarySourcesOptions
{
    public const string Section = "Library";

    public YouTubeSourceOptions YouTube { get; set; } = new();
}

public sealed class YouTubeSourceOptions
{
    /// <summary>روابط القنوات المعتمدة بصيغة المعرّف، مثل https://www.youtube.com/@SanadChannel — لا يُقبل فيديو من غيرها.</summary>
    public string[] AllowedChannels { get; set; } = [];
}

/// <summary>
/// قائمة سماح ثابتة بالمضيفين الذين يتصل بهم الخادم لجلب محتوى المكتبة — HTTPS فقط، المنفذ الافتراضي فقط.
/// كل تحويل (Redirect) يُتحقق منه يدوياً ضد القائمة نفسها قبل اتباعه؛ فلا يمكن لأي مصدر أن يوجّه الخادم إلى
/// عنوان داخلي أو خارجي آخر (SSRF).
/// </summary>
public static class TrustedSources
{
    public const string HttpClientName = "trusted-library-sources";

    private static readonly HashSet<string> Hosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "mp3quran.net", "www.mp3quran.net",
        "everyayah.com", "www.everyayah.com",
        "hisnmuslim.com", "www.hisnmuslim.com",
        "www.youtube.com",
    };

    private const string Mp3QuranServerSuffix = ".mp3quran.net";

    public static bool IsAllowed(Uri uri) =>
        uri.IsAbsoluteUri && uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo) &&
        (Hosts.Contains(uri.Host) || IsMp3QuranServer(uri.Host));

    /// <summary>خوادم ملفات mp3quran مرقّمة: server6.mp3quran.net … server16.mp3quran.net.</summary>
    private static bool IsMp3QuranServer(string host)
    {
        if (!host.StartsWith("server", StringComparison.OrdinalIgnoreCase) || !host.EndsWith(Mp3QuranServerSuffix, StringComparison.OrdinalIgnoreCase))
            return false;
        var number = host["server".Length..^Mp3QuranServerSuffix.Length];
        return number.Length is >= 1 and <= 3 && number.All(char.IsAsciiDigit);
    }

    /// <summary>فهرس حصن المسلم يعطي روابط http بينما الملفات نفسها متاحة عبر https: نرقّي الرابط بدل قبول http.</summary>
    public static Uri UpgradeToHttps(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttp ? new UriBuilder(uri) { Scheme = Uri.UriSchemeHttps, Port = -1 }.Uri : uri;

    public static async Task<HttpResponseMessage> GetAsync(HttpClient http, Uri uri, CancellationToken ct)
    {
        for (var hop = 0; hop <= 3; hop++)
        {
            if (!IsAllowed(uri)) throw new ExternalSourceException("المصدر خارج قائمة المصادر المعتمدة.");
            var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location)
            {
                response.Dispose();
                uri = location.IsAbsoluteUri ? location : new Uri(uri, location);
                continue;
            }
            return response;
        }
        throw new ExternalSourceException("المصدر أعاد التوجيه مرات كثيرة.");
    }

    /// <summary>ينزّل إلى ملف مؤقت يُحذف عند إغلاقه، مع فرض الحد أثناء القراءة لا بعدها.</summary>
    public static async Task<FileStream> DownloadToTempAsync(HttpClient http, Uri uri, long maxBytes, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromMinutes(10));
        try
        {
            using var response = await GetAsync(http, uri, timeout.Token);
            if (!response.IsSuccessStatusCode)
                throw new ExternalSourceException($"المصدر لم يُرجع الملف (HTTP {(int)response.StatusCode}).");
            if (response.Content.Headers.ContentLength > maxBytes)
                throw new ExternalSourceException($"الملف أكبر من الحد المسموح ({maxBytes / (1024 * 1024)} ميجابايت).");

            var file = CreateTempFile();
            try
            {
                await using var body = await response.Content.ReadAsStreamAsync(timeout.Token);
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await body.ReadAsync(buffer, timeout.Token)) > 0)
                {
                    total += read;
                    if (total > maxBytes) throw new ExternalSourceException($"الملف أكبر من الحد المسموح ({maxBytes / (1024 * 1024)} ميجابايت).");
                    await file.WriteAsync(buffer.AsMemory(0, read), timeout.Token);
                }
                file.Position = 0;
                return file;
            }
            catch
            {
                await file.DisposeAsync();
                throw;
            }
        }
        catch (Exception ex) when (ex is HttpRequestException || ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            throw new ExternalSourceException("تعذّر الوصول إلى المصدر الآن. حاول بعد قليل.");
        }
    }

    public static FileStream CreateTempFile() =>
        new(Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.DeleteOnClose | FileOptions.Asynchronous);
}
