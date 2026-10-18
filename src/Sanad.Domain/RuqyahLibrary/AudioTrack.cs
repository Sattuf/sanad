using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.RuqyahLibrary;

public enum AudioTrackCategory { QuranRecitation, Dua, Adhkar }

/// <summary>StoredAudio: ملف يخدمه سند نفسه. YouTube: فيديو مضمَّن من قناة معتمدة (لا يُنزَّل ولا يُخزَّن).</summary>
public enum AudioTrackMediaKind { StoredAudio, YouTube }

public sealed record AudioTrackPublishedEvent(Guid AudioTrackId) : IDomainEvent;
public sealed record AudioTrackUnpublishedEvent(Guid AudioTrackId) : IDomainEvent;

/// <summary>
/// مقطع في مكتبة الرقية: تلاوة أو دعاء أو ذكر معروف موثوق المصدر، يُدار مركزياً من ContentManager.
/// لا يُقدَّم كوعد بنتيجة — الوصف يمر على فلتر العبارات المحظورة عند الإنشاء وقبل النشر.
/// </summary>
public sealed class AudioTrack : BaseEntity, IAggregateRoot
{
    private AudioTrack() { }

    public string Title { get; private set; } = null!;
    public string SourceLabel { get; private set; } = null!;
    public string? Description { get; private set; }
    public AudioTrackCategory Category { get; private set; }
    public AudioTrackMediaKind MediaKind { get; private set; }
    public string? AudioStorageKey { get; private set; }
    public string? AudioContentType { get; private set; }
    public string? YouTubeVideoId { get; private set; }

    /// <summary>رابط المصدر الأصلي (للإسناد ولمنع استيراد المقطع نفسه مرتين). فارغ للملفات المرفوعة يدوياً.</summary>
    public string? SourceUrl { get; private set; }

    /// <summary>0 = غير معروفة (مسموح لمقاطع YouTube فقط، إذ لا تتوفر مدتها بلا مفتاح API).</summary>
    public int DurationSeconds { get; private set; }
    public bool IsPublished { get; private set; }
    public DateTimeOffset? PublishedAtUtc { get; private set; }
    public Guid CreatedByUserId { get; private set; }

    public static AudioTrack Create(string title, string sourceLabel, string? description, AudioTrackCategory category,
        string audioStorageKey, string audioContentType, int durationSeconds, Guid createdByUserId, IContentPolicyChecker policyChecker,
        string? sourceUrl = null)
    {
        var track = new AudioTrack
        {
            MediaKind = AudioTrackMediaKind.StoredAudio,
            AudioStorageKey = Guard.Required(audioStorageKey, "ملف الصوت", 300),
            AudioContentType = Guard.Required(audioContentType, "نوع الملف", 50),
            SourceUrl = HttpsUrlOrNull(sourceUrl),
            CreatedByUserId = Guard.NotEmpty(createdByUserId, "المنشئ"),
        };
        track.UpdateDetails(title, sourceLabel, description, category, durationSeconds, policyChecker);
        return track;
    }

    /// <summary>فيديو من قناة معتمدة — التحقق من القناة مسؤولية طبقة التطبيق قبل الاستدعاء.</summary>
    public static AudioTrack CreateFromYouTube(string title, string sourceLabel, string? description, AudioTrackCategory category,
        string videoId, int durationSeconds, Guid createdByUserId, IContentPolicyChecker policyChecker)
    {
        if (!IsYouTubeVideoId(videoId)) throw new DomainException("معرّف فيديو YouTube غير صالح.");
        var track = new AudioTrack
        {
            MediaKind = AudioTrackMediaKind.YouTube,
            YouTubeVideoId = videoId,
            SourceUrl = $"https://www.youtube.com/watch?v={videoId}",
            CreatedByUserId = Guard.NotEmpty(createdByUserId, "المنشئ"),
        };
        track.UpdateDetails(title, sourceLabel, description, category, durationSeconds, policyChecker);
        return track;
    }

    public static bool IsYouTubeVideoId(string? value) =>
        value is { Length: 11 } && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    public void UpdateDetails(string title, string sourceLabel, string? description, AudioTrackCategory category,
        int durationSeconds, IContentPolicyChecker policyChecker)
    {
        if (!Enum.IsDefined(category)) throw new DomainException("تصنيف المقطع غير معروف.");
        var minDuration = MediaKind == AudioTrackMediaKind.YouTube ? 0 : 1;
        if (durationSeconds < minDuration || durationSeconds > 4 * 3600) throw new DomainException("مدة المقطع غير صالحة.");
        var t = Guard.Required(title, "العنوان", 200);
        var s = Guard.Required(sourceLabel, "المصدر", 200);
        var d = Guard.Optional(description, "الوصف", 1500);
        ContentPolicy.EnsureAllowed(policyChecker, "وصف المقطع", t, s, d);
        Title = t;
        SourceLabel = s;
        Description = d;
        Category = category;
        DurationSeconds = durationSeconds;
    }

    /// <summary>بوابة نشر المحتوى: إعادة فحص كل النصوص قبل IsPublished = true.</summary>
    public void Publish(IContentPolicyChecker policyChecker, DateTimeOffset nowUtc)
    {
        ContentPolicy.EnsureAllowed(policyChecker, "وصف المقطع", Title, SourceLabel, Description);
        if (IsPublished) return;
        IsPublished = true;
        PublishedAtUtc = nowUtc;
        Raise(new AudioTrackPublishedEvent(Id));
    }

    public void Unpublish()
    {
        if (!IsPublished) return;
        IsPublished = false;
        Raise(new AudioTrackUnpublishedEvent(Id));
    }

    private static string? HttpsUrlOrNull(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var trimmed = url.Trim();
        if (trimmed.Length > 500 || !Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new DomainException("رابط المصدر يجب أن يكون رابط HTTPS صالحاً.");
        return trimmed;
    }
}
