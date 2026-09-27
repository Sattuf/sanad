using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Scheduling;

namespace Sanad.Domain.PatientCare;

public sealed record ProviderCaseNoteRecordedEvent(Guid CaseNoteId, Guid BookingRequestId) : IDomainEvent;

/// <summary>
/// ملاحظة المختص الخاصة — إشرافية/مهنية بحتة، بديل كامل لأي تقييم علني.
/// لا تصل للمستفيد أبداً تحت أي ظرف. لتوجيه المستفيد، الأداة الوحيدة هي ProviderRecommendation.
/// لا حقل تصنيف لحالة المستفيد هنا — النص حر بالكامل يكتبه المختص بنفسه.
/// </summary>
public sealed class ProviderCaseNote : BaseEntity, IAggregateRoot
{
    public const int MaxLength = 5000;

    private ProviderCaseNote() { }

    public Guid BookingRequestId { get; private set; }
    public Guid AuthoredByProviderProfileId { get; private set; }
    public string NoteEncrypted { get; private set; } = null!;
    public DateTimeOffset RecordedAtUtc { get; private set; }

    public static ProviderCaseNote Create(BookingRequest booking, Guid providerId, string plainText,
        IFieldEncryptor encryptor, IContentPolicyChecker policyChecker, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(booking);
        ArgumentNullException.ThrowIfNull(encryptor);
        if (!booking.IsAssignedTo(providerId))
            throw new DomainException("لا يمكن كتابة ملاحظة على حجز غير مُسنَد لهذا المختص.", "forbidden");
        if (booking.Status is not (BookingStatus.Accepted or BookingStatus.AdministrativelyCompleted or BookingStatus.UnderDispute))
            throw new DomainException("لا تُكتب ملاحظة إلا على حجز مقبول أو مكتمل.");

        var text = Guard.Required(plainText, "نص الملاحظة", MaxLength);
        ContentPolicy.EnsureAllowed(policyChecker, "الملاحظة (حتى في سياق خاص)", text);

        var note = new ProviderCaseNote
        {
            BookingRequestId = booking.Id,
            AuthoredByProviderProfileId = providerId,
            NoteEncrypted = encryptor.Encrypt(text),
            RecordedAtUtc = nowUtc,
        };
        note.Raise(new ProviderCaseNoteRecordedEvent(note.Id, booking.Id));
        return note;
    }
}
