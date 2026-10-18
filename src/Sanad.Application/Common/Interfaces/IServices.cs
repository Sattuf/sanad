namespace Sanad.Application.Common.Interfaces;

public interface ICurrentUser
{
    Guid? UserId { get; }
    IReadOnlyList<string> Roles { get; }
    bool IsInRole(string role);

    /// <summary>هل سُجّل الدخول بتحقق ثنائي (amr=mfa)؟ إلزامي لكل عملية إدارية حساسة.</summary>
    bool IsMfaAuthenticated { get; }
}

public interface IDateTime
{
    DateTimeOffset UtcNow { get; }
}

/// <summary>سياق الطلب الحالي (يُملأ من طبقة الـ API).</summary>
public interface IRequestContext
{
    string? CorrelationId { get; }
    string? IdempotencyKey { get; }
    string? ClientIp { get; }
    string PublicBaseUrl { get; }
}

public interface ICaptchaVerifier
{
    Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct);
}

/// <summary>تخزين مؤقت لنتائج الدليل والمكتبة (Redis في الإنتاج، ذاكرة محلياً).</summary>
public interface IDirectorySearchCache
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct);
    Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct);
    Task InvalidateAsync(string keyPrefix, CancellationToken ct);
}

public static class CacheKeys
{
    public const string DirectoryPrefix = "directory:";
    public const string LibraryPrefix = "library:";
}

public interface IFileStorage
{
    Task SaveAsync(string objectKey, Stream content, string contentType, CancellationToken ct);
    Task<Stream?> OpenReadAsync(string objectKey, CancellationToken ct);
    Task DeleteAsync(string objectKey, CancellationToken ct);

    /// <summary>رابط تنزيل موقّع قصير الأجل — للمستندات الخاصة فقط، للمنسق فقط.</summary>
    string GenerateShortLivedDownloadUrl(string objectKey, TimeSpan ttl);

    /// <summary>
    /// رابط قراءة مباشر لمحتوى عام منشور (CDN أو رابط موقّع) ليُخدم دون المرور بالـ API، أو null إن كان
    /// التخزين لا يدعمه (المحلي) فيُبث عبر الـ API كما هو (ADR-0020).
    /// </summary>
    string? DirectReadUrl(string objectKey, TimeSpan ttl);
}

/// <summary>LibraryAudioImport: صوت يجلبه الخادم من مصدر قرآني معتمد (حد حجم أكبر لأن السور الطويلة تتجاوز 100 ميجابايت).</summary>
public enum UploadKind { VerificationDocument, LibraryAudio, LibraryAudioImport }

public sealed record FileInspectionResult(bool IsAllowed, string? NormalizedContentType, string? Extension, string? Error);

/// <summary>فحص التوقيع الثنائي الفعلي (Magic Bytes) لا الامتداد المُدَّعى فقط.</summary>
public interface IFileSignatureInspector
{
    FileInspectionResult Inspect(UploadKind kind, ReadOnlySpan<byte> header, long length);
    long MaxBytes(UploadKind kind);
}

public sealed record NotificationMessage(Guid RecipientUserId, string Kind, string Title, string Body, string? Link = null);

/// <summary>
/// ناشر الإشعارات. النص عام دائماً ("لديك توصية جديدة") — لا يحمل أبداً نص ملاحظة أو توصية أو رسالة.
/// </summary>
public interface INotificationDispatcher
{
    Task DispatchAsync(NotificationMessage message, CancellationToken ct);
}

/// <summary>بث لحظي لمستخدم محدد (SignalR). الحمولة معرّفات فقط.</summary>
public interface IRealtimePublisher
{
    Task PublishToUserAsync(Guid userId, string eventName, object payload, CancellationToken ct);
}

public interface IAuditLogger
{
    Task LogAsync(string action, string entityType, Guid? entityId, object? metadata = null, bool succeeded = true, CancellationToken ct = default);

    /// <summary>تسجيل من سياق خلفي (Outbox) بفاعل محدد صراحة.</summary>
    Task LogForActorAsync(Guid? actorUserId, string action, string entityType, Guid? entityId, object? metadata = null, CancellationToken ct = default);
}

public interface IIdempotencyStore
{
    Task<string?> GetResponseAsync(string key, Guid? userId, string requestName, CancellationToken ct);
    Task SaveResponseAsync(string key, Guid? userId, string requestName, string responseJson, CancellationToken ct);
}

public interface IPolicyVersionProvider
{
    string CurrentVersion(Domain.Consent.ConsentType type);
}
