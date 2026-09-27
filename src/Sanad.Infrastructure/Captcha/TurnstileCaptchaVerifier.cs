using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Captcha;

public sealed class CaptchaOptions
{
    public const string Section = "Captcha";

    /// <summary>تعطيله مسموح في التطوير والاختبارات فقط — الإقلاع في الإنتاج يرفض Enabled=false.</summary>
    public bool Enabled { get; set; } = true;
    public string? SecretKey { get; set; }
    public string VerifyUrl { get; set; } = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
}

/// <summary>
/// Cloudflare Turnstile. إلزامي على: التسجيل بالبريد، طلب OTP (منع استنزاف رصيد الرسائل)، طلب الترقية، والبلاغات.
/// </summary>
public sealed class TurnstileCaptchaVerifier(HttpClient http, IOptions<CaptchaOptions> options, ILogger<TurnstileCaptchaVerifier> logger) : ICaptchaVerifier
{
    public async Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct)
    {
        var o = options.Value;
        if (!o.Enabled) return true;
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(o.SecretKey)) return false;

        var form = new Dictionary<string, string> { ["secret"] = o.SecretKey, ["response"] = token };
        if (!string.IsNullOrWhiteSpace(remoteIp)) form["remoteip"] = remoteIp;
        try
        {
            using var response = await http.PostAsync(o.VerifyUrl, new FormUrlEncodedContent(form), ct);
            if (!response.IsSuccessStatusCode) return false;
            var result = await response.Content.ReadFromJsonAsync<TurnstileResponse>(ct);
            return result?.Success == true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "CAPTCHA verification unavailable — failing closed");
            return false; // عند تعذّر التحقق: رفض، لا تمرير
        }
    }

    private sealed record TurnstileResponse([property: JsonPropertyName("success")] bool Success);
}
