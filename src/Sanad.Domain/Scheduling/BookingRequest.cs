using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Safety;

namespace Sanad.Domain.Scheduling;

public enum BookingStatus { Draft, Submitted, UnderReview, Accepted, AlternativeProposed, Rejected, Cancelled, AdministrativelyCompleted, UnderDispute }

public sealed record BookingSubmittedEvent(Guid BookingId, Guid ProviderProfileId) : IDomainEvent;
public sealed record BookingStatusChangedEvent(Guid BookingId, BookingStatus Status) : IDomainEvent;

/// <summary>
/// طلب حجز. يحمل "ملاحظتي للمختص" مشفّرةً فقط — لا تصنيف لحالة المستفيد في أي حقل.
/// </summary>
public sealed class BookingRequest : BaseEntity, IAggregateRoot, ISoftDeletable
{
    public const int MaxBeneficiaryNoteLength = 2000;

    // جدول الانتقالات من references/02-domain-model.md §2.5، مع إضافة سحب الطلب قبل القبول (ADR-0006)
    private static readonly Dictionary<BookingStatus, BookingStatus[]> AllowedTransitions = new()
    {
        [BookingStatus.Draft] = [BookingStatus.Submitted],
        [BookingStatus.Submitted] = [BookingStatus.UnderReview, BookingStatus.Cancelled],
        [BookingStatus.UnderReview] = [BookingStatus.Accepted, BookingStatus.AlternativeProposed, BookingStatus.Rejected, BookingStatus.Cancelled],
        [BookingStatus.AlternativeProposed] = [BookingStatus.Accepted, BookingStatus.Cancelled],
        [BookingStatus.Accepted] = [BookingStatus.AdministrativelyCompleted, BookingStatus.Cancelled, BookingStatus.UnderDispute],
        [BookingStatus.AdministrativelyCompleted] = [BookingStatus.UnderDispute],
        [BookingStatus.UnderDispute] = [],
        [BookingStatus.Rejected] = [],
        [BookingStatus.Cancelled] = [],
    };

    private BookingRequest() { }

    public Guid BeneficiaryUserId { get; private set; }
    public Guid ServiceOfferingId { get; private set; }
    public Guid AvailabilitySlotId { get; private set; }
    public Guid ProviderProfileIdOfAssignedService { get; private set; }
    public BookingStatus Status { get; private set; } = BookingStatus.Draft;
    public string? AdministrativeReasonForRejection { get; private set; }
    public string? IdempotencyKey { get; private set; }

    /// <summary>"ملاحظتي للمختص" — نص مشفّر فقط. فك التشفير يحدث حصراً في Query محمي.</summary>
    public string? BeneficiaryNoteEncrypted { get; private set; }

    public bool IsDeleted { get; private set; }

    public static BookingRequest Create(
        Guid beneficiaryUserId, ServiceOffering offering, ProviderProfile provider, AvailabilitySlot slot,
        string? idempotencyKey, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(offering);
        ArgumentNullException.ThrowIfNull(provider);
        ArgumentNullException.ThrowIfNull(slot);
        if (!offering.IsActive) throw new DomainException("الخدمة غير متاحة حالياً.");
        if (provider.Status != PublicationStatus.Published) throw new DomainException("مقدّم الخدمة غير منشور في الدليل.");
        if (offering.ProviderProfileId != provider.Id || slot.ProviderProfileId != provider.Id)
            throw new DomainException("الخدمة والفترة لا تخصان نفس المختص.");
        if (provider.UserId == beneficiaryUserId) throw new DomainException("لا يمكن حجز خدمة من نفسك.");

        slot.Hold(nowUtc);

        var booking = new BookingRequest
        {
            BeneficiaryUserId = Guard.NotEmpty(beneficiaryUserId, "المستفيد"),
            ServiceOfferingId = offering.Id,
            AvailabilitySlotId = slot.Id,
            ProviderProfileIdOfAssignedService = provider.Id,
            IdempotencyKey = Guard.Optional(idempotencyKey, "مفتاح التكرار", 100),
        };
        booking.TransitionTo(BookingStatus.Submitted);
        booking.TransitionTo(BookingStatus.UnderReview);
        booking.Raise(new BookingSubmittedEvent(booking.Id, provider.Id));
        return booking;
    }

    public bool IsAssignedTo(Guid providerProfileId) => ProviderProfileIdOfAssignedService == providerProfileId;

    public bool BelongsToBeneficiary(Guid userId) => BeneficiaryUserId == userId;

    /// <summary>
    /// يشفّر الملاحظة فوراً (ADR-0004)؛ لا يراها إلا المختص المُسنَد، أو المنسق عند تصعيد مرتبط بالحجز.
    /// </summary>
    public void SetBeneficiaryNote(string? plainNote, IFieldEncryptor encryptor)
    {
        ArgumentNullException.ThrowIfNull(encryptor);
        if (string.IsNullOrWhiteSpace(plainNote)) { BeneficiaryNoteEncrypted = null; return; }
        var trimmed = plainNote.Trim();
        if (trimmed.Length > MaxBeneficiaryNoteLength) throw new DomainException($"الملاحظة أطول من {MaxBeneficiaryNoteLength} حرف.");

        BeneficiaryNoteEncrypted = encryptor.Encrypt(trimmed);
    }

    public void AcceptByProvider(Guid providerProfileId, AvailabilitySlot slot)
    {
        EnsureProvider(providerProfileId);
        EnsureSlot(slot);
        if (Status != BookingStatus.UnderReview) throw new DomainException("لا يُقبل إلا طلب قيد المراجعة.", "invalid_state");
        slot.Book();
        TransitionTo(BookingStatus.Accepted);
    }

    public void ProposeAlternative(Guid providerProfileId, AvailabilitySlot currentSlot, AvailabilitySlot alternativeSlot, DateTimeOffset nowUtc)
    {
        EnsureProvider(providerProfileId);
        EnsureSlot(currentSlot);
        ArgumentNullException.ThrowIfNull(alternativeSlot);
        if (alternativeSlot.ProviderProfileId != ProviderProfileIdOfAssignedService)
            throw new DomainException("الفترة البديلة لا تخص نفس المختص.");
        if (alternativeSlot.Id == currentSlot.Id) throw new DomainException("الفترة البديلة هي نفس الفترة الحالية.");
        if (Status != BookingStatus.UnderReview) throw new DomainException("لا يُقترح بديل إلا لطلب قيد المراجعة.", "invalid_state");

        alternativeSlot.Hold(nowUtc);
        currentSlot.Release();
        AvailabilitySlotId = alternativeSlot.Id;
        TransitionTo(BookingStatus.AlternativeProposed);
    }

    public void AcceptAlternativeByBeneficiary(Guid beneficiaryUserId, AvailabilitySlot slot)
    {
        EnsureBeneficiary(beneficiaryUserId);
        EnsureSlot(slot);
        if (Status != BookingStatus.AlternativeProposed) throw new DomainException("لا يوجد موعد بديل مقترح.", "invalid_state");
        slot.Book();
        TransitionTo(BookingStatus.Accepted);
    }

    public void RejectByProvider(Guid providerProfileId, string administrativeReason, AvailabilitySlot slot)
    {
        EnsureProvider(providerProfileId);
        EnsureSlot(slot);
        AdministrativeReasonForRejection = Guard.Required(administrativeReason, "سبب الرفض الإداري", 300);
        TransitionTo(BookingStatus.Rejected);
        slot.Release();
    }

    public void Cancel(Guid actorUserId, Guid? actorProviderProfileId, AvailabilitySlot slot)
    {
        var isBeneficiary = BeneficiaryUserId == actorUserId;
        var isProvider = actorProviderProfileId is { } pid && IsAssignedTo(pid);
        if (!isBeneficiary && !isProvider) throw new DomainException("لا تملك صلاحية إلغاء هذا الحجز.", "forbidden");
        EnsureSlot(slot);
        TransitionTo(BookingStatus.Cancelled);
        slot.Release();
    }

    public void CompleteAdministratively(Guid providerProfileId, AvailabilitySlot slot, DateTimeOffset nowUtc)
    {
        EnsureProvider(providerProfileId);
        EnsureSlot(slot);
        if (nowUtc < slot.EndUtc) throw new DomainException("لا يُغلق الحجز إدارياً قبل انتهاء موعده.");
        TransitionTo(BookingStatus.AdministrativelyCompleted);
    }

    public void OpenDispute(Guid actorUserId, Guid? actorProviderProfileId)
    {
        var isParty = BeneficiaryUserId == actorUserId || (actorProviderProfileId is { } pid && IsAssignedTo(pid));
        if (!isParty) throw new DomainException("لا تملك صلاحية فتح نزاع على هذا الحجز.", "forbidden");
        TransitionTo(BookingStatus.UnderDispute);
    }

    /// <summary>
    /// عند حذف حساب المستفيد: تجريد لا حذف (ADR-0005) — يُستبدل المعرّف بمعرّف مجهول ثابت
    /// وتُمحى الملاحظة الشخصية، ويبقى أثر أن حجزاً قد تم.
    /// </summary>
    public void AnonymizeBeneficiary(Guid anonymousUserId)
    {
        BeneficiaryUserId = anonymousUserId;
        BeneficiaryNoteEncrypted = null;
        IdempotencyKey = null;
    }

    public void TransitionTo(BookingStatus target)
    {
        if (!AllowedTransitions.TryGetValue(Status, out var allowed) || !allowed.Contains(target))
            throw new DomainException($"انتقال حالة غير مسموح: {Status} → {target}", "invalid_transition");
        Status = target;
        Raise(new BookingStatusChangedEvent(Id, target));
    }

    private void EnsureProvider(Guid providerProfileId)
    {
        if (!IsAssignedTo(providerProfileId)) throw new DomainException("هذا الحجز غير مُسنَد لهذا المختص.", "forbidden");
    }

    private void EnsureBeneficiary(Guid userId)
    {
        if (!BelongsToBeneficiary(userId)) throw new DomainException("هذا الحجز لا يخصك.", "forbidden");
    }

    private void EnsureSlot(AvailabilitySlot slot)
    {
        ArgumentNullException.ThrowIfNull(slot);
        if (slot.Id != AvailabilitySlotId) throw new DomainException("الفترة لا تطابق هذا الحجز.");
    }
}
