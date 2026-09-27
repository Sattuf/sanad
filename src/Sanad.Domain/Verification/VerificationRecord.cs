using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Identity;

namespace Sanad.Domain.Verification;

public enum VerificationSubjectType { Organization, ProviderProfile }

public enum VerificationStatus { PendingReview, ConditionallyApproved, Approved, RequiresCompletion, Rejected, Suspended, Expired }

public enum VerificationRejectionReason { DocumentTypeMismatch, DocumentUnreadable, IssuerNotRecognized, InformationInconsistent, Other }

public sealed record VerificationRequestedEvent(Guid VerificationId, VerificationSubjectType SubjectType) : IDomainEvent;
public sealed record VerificationDecidedEvent(Guid VerificationId, Guid SubjectId, Guid? ApplicantUserId, VerificationStatus Status) : IDomainEvent;
public sealed record VerificationExpiredEvent(Guid VerificationId, Guid SubjectId, VerificationSubjectType SubjectType) : IDomainEvent;

/// <summary>
/// سجل توثيق إداري. الاعتماد هنا قرار إداري منفصل تماماً عن تحقق الهوية عند التسجيل
/// (IdentityVerified ≠ AdministrativelyApproved).
/// </summary>
public sealed class VerificationRecord : BaseEntity, IAggregateRoot
{
    private VerificationRecord() { }

    /// <summary>
    /// معرّف الكيان الموثَّق. لطلب ترقية مختص يُولَّد مسبقاً ويصبح معرّف ProviderProfile عند الاعتماد.
    /// </summary>
    public Guid SubjectId { get; private set; }
    public VerificationSubjectType SubjectType { get; private set; }
    public Guid? ApplicantUserId { get; private set; }
    public PractitionerType? DeclaredPractitionerType { get; private set; }
    public string? DeclaredTitle { get; private set; }
    public string DocumentType { get; private set; } = null!;
    public string IssuingAuthority { get; private set; } = null!;
    public Guid? DocumentFileId { get; private set; }
    public string? VerificationSourceUrl { get; private set; }
    public VerificationStatus Status { get; private set; } = VerificationStatus.PendingReview;
    public VerificationRejectionReason? RejectionReason { get; private set; }
    public DateTimeOffset SubmittedAtUtc { get; private set; }
    public DateTimeOffset? LastCheckedAtUtc { get; private set; }
    public DateTimeOffset? ExpiresAtUtc { get; private set; }
    public Guid? ReviewedByCoordinatorId { get; private set; }

    public static VerificationRecord RequestProviderUpgrade(
        Guid applicantUserId, PractitionerType requestedType, string declaredTitle, string documentType,
        string issuingAuthority, Guid documentFileId, DateTimeOffset nowUtc)
    {
        if (!Enum.IsDefined(requestedType)) throw new DomainException("نوع الممارسة غير معروف.");
        var docType = Guard.Required(documentType, "نوع المستند", 60);
        if (!VerificationDocumentTypes.IsKnownPractitionerDocument(docType))
            throw new DomainException("نوع المستند غير مدرج في القائمة المسموحة.");

        var record = new VerificationRecord
        {
            SubjectId = Guid.NewGuid(),
            SubjectType = VerificationSubjectType.ProviderProfile,
            ApplicantUserId = Guard.NotEmpty(applicantUserId, "المستخدم"),
            DeclaredPractitionerType = requestedType,
            DeclaredTitle = Guard.Required(declaredTitle, "اللقب المهني", 200),
            DocumentType = docType,
            IssuingAuthority = Guard.Required(issuingAuthority, "جهة الإصدار", 200),
            DocumentFileId = Guard.NotEmpty(documentFileId, "المستند"),
            SubmittedAtUtc = nowUtc,
        };
        record.Raise(new VerificationRequestedEvent(record.Id, record.SubjectType));
        return record;
    }

    public static VerificationRecord RequestForOrganization(
        Guid organizationId, string documentType, string issuingAuthority, string? verificationSourceUrl,
        Guid? documentFileId, DateTimeOffset nowUtc)
    {
        var record = new VerificationRecord
        {
            SubjectId = Guard.NotEmpty(organizationId, "الجهة"),
            SubjectType = VerificationSubjectType.Organization,
            DocumentType = Guard.Required(documentType, "نوع المستند", 60),
            IssuingAuthority = Guard.Required(issuingAuthority, "جهة الإصدار", 200),
            VerificationSourceUrl = Guard.Optional(verificationSourceUrl, "رابط مصدر التحقق", 500),
            DocumentFileId = documentFileId,
            SubmittedAtUtc = nowUtc,
        };
        record.Raise(new VerificationRequestedEvent(record.Id, record.SubjectType));
        return record;
    }

    /// <summary>هل نوع المستند المرفوع يطابق نوع الممارسة المُعلَن؟ (طلبات الجهات لا تحمل نوع ممارسة)</summary>
    public bool DocumentMatchesDeclaredType() =>
        DeclaredPractitionerType is not { } type || VerificationDocumentTypes.Matches(type, DocumentType);

    public void Approve(Guid coordinatorId, bool conditional, DateTimeOffset expiresAtUtc, DateTimeOffset nowUtc)
    {
        EnsureReviewable();
        if (!DocumentMatchesDeclaredType())
            throw new DomainException(
                "نوع المستند لا يطابق نوع الممارسة المُعلَن — يجب الرفض بسبب DocumentTypeMismatch، لا الاعتماد.",
                "document_type_mismatch");
        if (expiresAtUtc <= nowUtc) throw new DomainException("تاريخ انتهاء التوثيق يجب أن يكون في المستقبل.");
        if (expiresAtUtc > nowUtc.AddYears(3)) throw new DomainException("مدة التوثيق لا تتجاوز ثلاث سنوات قبل إعادة التحقق.");

        Status = conditional ? VerificationStatus.ConditionallyApproved : VerificationStatus.Approved;
        RejectionReason = null;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        LastCheckedAtUtc = nowUtc;
        ExpiresAtUtc = expiresAtUtc;
        Raise(new VerificationDecidedEvent(Id, SubjectId, ApplicantUserId, Status));
    }

    public void Reject(Guid coordinatorId, VerificationRejectionReason reason, DateTimeOffset nowUtc)
    {
        EnsureReviewable();
        if (!Enum.IsDefined(reason)) throw new DomainException("سبب الرفض غير معروف.");
        Status = VerificationStatus.Rejected;
        RejectionReason = reason;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        LastCheckedAtUtc = nowUtc;
        Raise(new VerificationDecidedEvent(Id, SubjectId, ApplicantUserId, Status));
    }

    public void RequireCompletion(Guid coordinatorId, DateTimeOffset nowUtc)
    {
        EnsureReviewable();
        Status = VerificationStatus.RequiresCompletion;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        LastCheckedAtUtc = nowUtc;
        Raise(new VerificationDecidedEvent(Id, SubjectId, ApplicantUserId, Status));
    }

    /// <summary>استكمال المستند بعد طلب الاستكمال — يعيد الطلب لقائمة المراجعة.</summary>
    public void Resubmit(Guid applicantUserId, string documentType, Guid documentFileId, DateTimeOffset nowUtc)
    {
        if (Status != VerificationStatus.RequiresCompletion) throw new DomainException("لا يمكن الاستكمال إلا لطلب مطلوب استكماله.");
        if (ApplicantUserId != applicantUserId) throw new DomainException("هذا الطلب لا يخص هذا المستخدم.");
        var docType = Guard.Required(documentType, "نوع المستند", 60);
        if (!VerificationDocumentTypes.IsKnownPractitionerDocument(docType))
            throw new DomainException("نوع المستند غير مدرج في القائمة المسموحة.");
        DocumentType = docType;
        DocumentFileId = Guard.NotEmpty(documentFileId, "المستند");
        Status = VerificationStatus.PendingReview;
        SubmittedAtUtc = nowUtc;
        Raise(new VerificationRequestedEvent(Id, SubjectType));
    }

    /// <summary>إعادة تحقق دورية من مصدر التوثيق بعد الاعتماد.</summary>
    public void Recheck(Guid coordinatorId, bool stillValid, DateTimeOffset? newExpiresAtUtc, DateTimeOffset nowUtc)
    {
        if (Status is not (VerificationStatus.Approved or VerificationStatus.ConditionallyApproved or VerificationStatus.Expired))
            throw new DomainException("إعادة التحقق متاحة فقط لتوثيق معتمد أو منتهٍ.");
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        LastCheckedAtUtc = nowUtc;
        if (!stillValid)
        {
            Status = VerificationStatus.Suspended;
        }
        else
        {
            if (newExpiresAtUtc is not { } exp || exp <= nowUtc || exp > nowUtc.AddYears(3))
                throw new DomainException("تاريخ انتهاء جديد صالح مطلوب عند تأكيد سريان التوثيق.");
            ExpiresAtUtc = exp;
            if (Status == VerificationStatus.Expired) Status = VerificationStatus.Approved;
        }
        Raise(new VerificationDecidedEvent(Id, SubjectId, ApplicantUserId, Status));
    }

    public void Suspend(Guid coordinatorId, DateTimeOffset nowUtc)
    {
        Status = VerificationStatus.Suspended;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        LastCheckedAtUtc = nowUtc;
        Raise(new VerificationDecidedEvent(Id, SubjectId, ApplicantUserId, Status));
    }

    public void ExpireIfPastDue(DateTimeOffset nowUtc)
    {
        if (ExpiresAtUtc.HasValue && nowUtc > ExpiresAtUtc &&
            Status is VerificationStatus.Approved or VerificationStatus.ConditionallyApproved)
        {
            Status = VerificationStatus.Expired;
            Raise(new VerificationExpiredEvent(Id, SubjectId, SubjectType));
        }
    }

    /// <summary>توثيق ساري المفعول الآن: معتمد أو مشروط، ولم تنتهِ صلاحيته.</summary>
    public bool IsCurrentlyValid(DateTimeOffset nowUtc) =>
        Status is VerificationStatus.Approved or VerificationStatus.ConditionallyApproved &&
        ExpiresAtUtc is { } exp && exp > nowUtc;

    private void EnsureReviewable()
    {
        if (Status is not (VerificationStatus.PendingReview or VerificationStatus.RequiresCompletion))
            throw new DomainException($"لا يمكن مراجعة طلب حالته {Status}.", "invalid_state");
    }
}
