using System.Net;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Domain.Ruqyah;

namespace Sanad.Infrastructure.Notifications;

/// <summary>مفاتيح VAPID لإشعارات الأذكار. تُولَّد مرة واحدة (زوج P-256 بترميز base64url) وتُحفظ في الأسرار.</summary>
public sealed class WebPushOptions
{
    public const string Section = "WebPush";

    public bool Enabled { get; set; }
    public string? PublicKey { get; set; }
    public string? PrivateKey { get; set; }

    /// <summary>جهة اتصال يطلبها معيار VAPID (mailto: أو https:).</summary>
    public string Subject { get; set; } = "mailto:support@sanad.app";

    /// <summary>تشغيل مهمة الإرسال الدورية (تُعطَّل في الاختبارات وتُشغَّل يدوياً).</summary>
    public bool SchedulerEnabled { get; set; } = true;

    /// <summary>
    /// إرسالات متوازية لخدمات الدفع في ذروة الأوقات. الإرسال محكوم بزمن الشبكة (~100ms لكل إشعار):
    /// 32 تعني ~300 إشعار/ث، فتُرسل 20 ألف تذكير في نحو دقيقة (ADR-0020).
    /// </summary>
    public int MaxParallelSends { get; set; } = 32;

    public bool IsConfigured => Enabled && !string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(PrivateKey);
}

/// <summary>Web Push بمعيار المتصفح مباشرة (RFC 8030 + VAPID) — بلا حساب مزوّد خارجي، والحمولة مشفّرة للجهاز.</summary>
public sealed class WebPushReminderSender : IReminderPushSender, IDisposable
{
    public const string HttpClientName = "web-push";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly WebPushOptions _options;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<WebPushReminderSender> _logger;
    private readonly VapidAuthentication? _vapid;

    public WebPushReminderSender(IOptions<WebPushOptions> options, IHttpClientFactory http, ILogger<WebPushReminderSender> logger)
    {
        _options = options.Value;
        _http = http;
        _logger = logger;
        if (_options.IsConfigured)
            _vapid = new VapidAuthentication(_options.PublicKey, _options.PrivateKey) { Subject = _options.Subject };
    }

    public void Dispose() => _vapid?.Dispose();

    public bool IsConfigured => _vapid is not null;
    public string? PublicKey => IsConfigured ? _options.PublicKey : null;

    public async Task<PushDelivery> SendAsync(ReminderDevice device, ReminderPush message, CancellationToken ct)
    {
        if (_vapid is null) return PushDelivery.Failed;
        // العنوان قُبل عند التسجيل من قائمة خدمات الدفع المعروفة؛ نعيد الفحص قبل أي طلب صادر
        if (!PushServiceHosts.IsAllowed(device.Endpoint)) return PushDelivery.Gone;

        var push = new PushMessage(JsonSerializer.Serialize(message, Json))
        {
            Topic = message.Tag,
            TimeToLive = (int)ReminderDevice.SendWindow.TotalSeconds,
            Urgency = PushMessageUrgency.Normal,
        };

        try
        {
            var client = new PushServiceClient(_http.CreateClient(HttpClientName)) { AutoRetryAfter = false };
            await client.RequestPushMessageDeliveryAsync(
                new() { Endpoint = device.Endpoint, Keys = new Dictionary<string, string> { ["p256dh"] = device.P256dh, ["auth"] = device.Auth } },
                push, _vapid, VapidAuthenticationScheme.Vapid, ct);
            return PushDelivery.Delivered;
        }
        catch (PushServiceClientException ex) when (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return PushDelivery.Gone;
        }
        catch (Exception ex) when (ex is PushServiceClientException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Web push delivery failed ({Tag})", message.Tag);
            return PushDelivery.Failed;
        }
    }
}
