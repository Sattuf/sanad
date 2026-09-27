using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Domain.RuqyahLibrary;

namespace Sanad.Infrastructure.Library;

/// <summary>
/// يقبل فيديو YouTube فقط إن كان من قناة معتمدة في الإعدادات. التحقق عبر oEmbed الرسمي (بلا مفتاح API):
/// يعيد عنوان الفيديو ورابط قناته، ويرفض الفيديو الخاص أو الممنوع تضمينه. لا يُنزَّل أي محتوى من YouTube.
/// </summary>
public sealed class YouTubeVideoVerifier(IHttpClientFactory httpFactory, IOptions<LibrarySourcesOptions> options) : IYouTubeVideoVerifier
{
    public IReadOnlyList<string> AllowedChannels =>
        options.Value.YouTube.AllowedChannels.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).ToList();

    public async Task<YouTubeVideoInfo> VerifyAsync(string url, CancellationToken ct)
    {
        var allowed = AllowedChannels.Select(NormalizeChannel).OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (allowed.Count == 0)
            throw new RequestValidationException("url", "لم تُحدَّد قناة YouTube معتمدة بعد. أضف رابط القناة في الإعداد Library:YouTube:AllowedChannels.");
        var videoId = ExtractVideoId(url) ?? throw new RequestValidationException("url", "رابط YouTube غير صالح. انسخ رابط الفيديو من زر «مشاركة».");

        var watchUrl = $"https://www.youtube.com/watch?v={videoId}";
        var oembed = new Uri($"https://www.youtube.com/oembed?format=json&url={Uri.EscapeDataString(watchUrl)}");
        string? title, channelName, channelUrl;
        try
        {
            using var response = await TrustedSources.GetAsync(httpFactory.CreateClient(TrustedSources.HttpClientName), oembed, ct);
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.BadRequest)
                throw new RequestValidationException("url", "الفيديو غير موجود أو خاص أو ممنوع تضمينه. اجعله «عام» أو «غير مدرج» واسمح بالتضمين.");
            if (!response.IsSuccessStatusCode) throw new ExternalSourceException("تعذّر التحقق من الفيديو لدى YouTube الآن.");
            await using var body = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(body, cancellationToken: ct);
            title = doc.RootElement.TryGetProperty("title", out var t) ? t.GetString() : null;
            channelName = doc.RootElement.TryGetProperty("author_name", out var n) ? n.GetString() : null;
            channelUrl = doc.RootElement.TryGetProperty("author_url", out var u) ? u.GetString() : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException || ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            throw new ExternalSourceException("تعذّر الوصول إلى YouTube الآن. حاول بعد قليل.");
        }

        if (channelUrl is null || NormalizeChannel(channelUrl) is not { } channel || !allowed.Contains(channel))
            throw new RequestValidationException("url", $"الفيديو ليس من قناة معتمدة (قناته: {channelName ?? "غير معروفة"}).");
        return new YouTubeVideoInfo(videoId, string.IsNullOrWhiteSpace(title) ? "مقطع من YouTube" : title.Trim(), channelName?.Trim() ?? "");
    }

    /// <summary>يقبل: رابط watch، youtu.be، shorts، live، embed، أو المعرّف وحده (11 حرفاً).</summary>
    public static string? ExtractVideoId(string? input)
    {
        var value = input?.Trim();
        if (string.IsNullOrEmpty(value)) return null;
        if (AudioTrack.IsYouTubeVideoId(value)) return value;
        if (!value.Contains("://", StringComparison.Ordinal)) value = "https://" + value;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return null;

        var host = uri.Host.ToLowerInvariant();
        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        string? id = null;
        if (host == "youtu.be")
            id = segments.FirstOrDefault();
        else if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "music.youtube.com" or "www.youtube-nocookie.com")
        {
            if (segments is ["watch", ..])
                id = uri.Query.TrimStart('?').Split('&').Select(p => p.Split('=', 2)).FirstOrDefault(p => p.Length == 2 && p[0] == "v")?[1];
            else if (segments is ["shorts" or "live" or "embed" or "v", var second, ..])
                id = second;
        }
        return AudioTrack.IsYouTubeVideoId(id) ? id : null;
    }

    /// <summary>يوحّد صيغ القناة إلى مسارها: ‎@handle أو ‎/@handle/videos أو الرابط الكامل ← "/@handle".</summary>
    public static string? NormalizeChannel(string value)
    {
        var v = value.Trim();
        if (v.StartsWith('@')) return "/" + v.Split('/')[0];
        if (!v.Contains("://", StringComparison.Ordinal)) v = "https://" + v;
        if (!Uri.TryCreate(v, UriKind.Absolute, out var uri) || !uri.Host.EndsWith("youtube.com", StringComparison.OrdinalIgnoreCase)) return null;
        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments switch
        {
            [var handle, ..] when handle.StartsWith('@') => "/" + handle,
            ["channel" or "c" or "user", var name, ..] => $"/{segments[0]}/{name}",
            _ => null,
        };
    }
}
