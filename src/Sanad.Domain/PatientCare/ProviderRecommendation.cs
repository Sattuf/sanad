using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Scheduling;

namespace Sanad.Domain.PatientCare;

public sealed record ProviderRecommendationSentEvent(Guid RecommendationId, Guid RecipientBeneficiaryUserId) : IDomainEvent;

/// <summary>
/// توصية المختص للمستفيد — الأداة الوحيدة في النظام التي توجّه المستفيد مباشرة.
/// تمر على فلتر العبارات المحظورة بنفس صرامة وصف الخدمة، بلا أي استثناء للكاتب:
/// لا وعد بشفاء ولا ضمان نتيجة هنا (references/07-safety-guardrails.md §7.6).
/// </summary>
public sealed class ProviderRecommendation : BaseEntity, IAggregateRoot
{
    public const int MaxGuidanceLength = 3000;
    public const int MaxTracks = 10;

    private ProviderRecommendation() { }

    public Guid BookingRequestId { get; private set; }
    public Guid AuthoredByProviderProfileId { get; private set; }
    public Guid RecipientBeneficiaryUserId { get; private set; }
    public string GuidanceTextEncrypted { get; private set; } = null!;
    public List<Guid> RecommendedAudioTrackIds { get; private set; } = new();
    public DateTimeOffset RecordedAtUtc { get; private set; }

    /// <summary>إيصال اطّلاع فقط — ليس موافقة ولا إقراراً قانونياً، ولا تُبنى عليه أي قاعدة عمل.</summary>
    public DateTimeOffset? AcknowledgedByBeneficiaryAtUtc { get; private set; }

    public static ProviderRecommendation Create(BookingRequest booking, Guid providerId, string plainGuidanceText,
        IReadOnlyList<AudioTrack> proposedTracks, IFieldEncryptor encryptor, IContentPolicyChecker policyChecker,
        DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(booking);
        ArgumentNullException.ThrowIfNull(encryptor);
        proposedTracks ??= [];

        if (!booking.IsAssignedTo(providerId))
            throw new DomainException("لا يمكن إرسال توصية على حجز غير مُسنَد لهذا المختص.", "forbidden");
        if (booking.Status is not (BookingStatus.Accepted or BookingStatus.AdministrativelyCompleted))
            throw new DomainException("لا تُرسَل توصية قبل قبول الحجز فعلياً.");

        var text = Guard.Required(plainGuidanceText, "نص التوصية", MaxGuidanceLength);
        ContentPolicy.EnsureAllowed(policyChecker, "التوصية", text);

        if (proposedTracks.Count > MaxTracks) throw new DomainException($"الحد الأقصى {MaxTracks} مقاطع في التوصية الواحدة.");
        if (proposedTracks.Any(t => !t.IsPublished))
            throw new DomainException("لا يمكن اقتراح مقطع غير منشور من المكتبة.", "track_not_published");

        var rec = new ProviderRecommendation
        {
            BookingRequestId = booking.Id,
            AuthoredByProviderProfileId = providerId,
            RecipientBeneficiaryUserId = booking.BeneficiaryUserId,
            GuidanceTextEncrypted = encryptor.Encrypt(text),
            RecordedAtUtc = nowUtc,
        };
        rec.RecommendedAudioTrackIds.AddRange(proposedTracks.Select(t => t.Id).Distinct());
        rec.Raise(new ProviderRecommendationSentEvent(rec.Id, booking.BeneficiaryUserId));
        return rec;
    }

    public void MarkAcknowledged(Guid beneficiaryUserId, DateTimeOffset nowUtc)
    {
        if (beneficiaryUserId != RecipientBeneficiaryUserId) throw new DomainException("هذه التوصية ليست لك.", "forbidden");
        AcknowledgedByBeneficiaryAtUtc ??= nowUtc;
    }

    /// <summary>عند حذف حساب المستفيد: تجريد لا حذف — يبقى أثر أن توصية أُرسلت، بلا ربط بهوية وبلا نصها.</summary>
    public void AnonymizeRecipient(Guid anonymousUserId, string encryptedRedactionMarker)
    {
        RecipientBeneficiaryUserId = anonymousUserId;
        GuidanceTextEncrypted = encryptedRedactionMarker;
    }
}
