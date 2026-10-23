using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Sanad.Infrastructure.Notifications;

/// <summary>إرسال رسالة بيانات (data-only) إلى أجهزة؛ يعيد الرموز التي رفضها FCM نهائياً (أزيل التطبيق أو انتهى الرمز).</summary>
public interface IFcmSender
{
    bool IsConfigured { get; }
    Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<string> tokens, IReadOnlyDictionary<string, string> data, CancellationToken ct);
}

/// <summary>
/// FCM HTTP v1 عبر Firebase Admin SDK، بحساب الخدمة في Fcm:ServiceAccountJson (سرّ — Key Vault في الإنتاج).
/// رسالة بيانات فقط بلا عنوان ولا نص: التطبيق يكتب نص الإشعار بنفسه، فيحترم الوضع المتحفّظ ولا يمر أي نص عبر Google.
/// </summary>
public sealed class FirebaseFcmSender : IFcmSender
{
    private readonly FirebaseMessaging? _messaging;
    private readonly ILogger<FirebaseFcmSender> _logger;

    public FirebaseFcmSender(IConfiguration config, ILogger<FirebaseFcmSender> logger)
    {
        _logger = logger;
        var json = config["Fcm:ServiceAccountJson"];
        if (string.IsNullOrWhiteSpace(json)) return;
        // نسخة مسمّاة: لا تتعارض مع أي FirebaseApp افتراضي في العملية نفسها
        var app = FirebaseApp.GetInstance("sanad") ?? FirebaseApp.Create(new AppOptions { Credential = CredentialFactory.FromJson<ServiceAccountCredential>(json).ToGoogleCredential() }, "sanad");
        _messaging = FirebaseMessaging.GetMessaging(app);
    }

    public bool IsConfigured => _messaging is not null;

    public async Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<string> tokens, IReadOnlyDictionary<string, string> data, CancellationToken ct)
    {
        if (_messaging is null || tokens.Count == 0) return [];
        var messages = tokens.Select(t => new Message
        {
            Token = t,
            Data = data,
            // أولوية عالية: تصل والتطبيق مغلق ويستيقظ معالج الخلفية ليعرض الإشعار
            Android = new AndroidConfig { Priority = Priority.High, TimeToLive = TimeSpan.FromDays(1) },
        }).ToList();
        var response = await _messaging.SendEachAsync(messages, ct);
        var gone = new List<string>();
        for (var i = 0; i < response.Responses.Count; i++)
        {
            var error = response.Responses[i].Exception?.MessagingErrorCode;
            if (error is MessagingErrorCode.Unregistered or MessagingErrorCode.InvalidArgument) gone.Add(tokens[i]);
            else if (response.Responses[i].Exception is { } ex) _logger.LogWarning("FCM send failed: {Code}", error?.ToString() ?? ex.GetType().Name);
        }
        return gone;
    }
}
