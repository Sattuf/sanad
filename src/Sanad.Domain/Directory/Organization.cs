using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Verification;

namespace Sanad.Domain.Directory;

/// <summary>المسارات الثابتة — يختارها المستخدم بنفسه من واجهة محايدة، ولا ترتيب بينها.</summary>
public enum OrganizationTrack { WaqfFree, DawahGuidance, IndependentConsultant }

public enum PublicationStatus { Draft, ConditionallyApproved, Published, Suspended, Rejected }

public sealed record OrganizationPublishedEvent(Guid OrganizationId) : IDomainEvent;
public sealed record OrganizationSuspendedEvent(Guid OrganizationId, string ReasonCode) : IDomainEvent;

public sealed class Organization : BaseEntity, IAggregateRoot
{
    private Organization() { }

    public string LegalName { get; private set; } = null!;
    public string? TradeName { get; private set; }
    public OrganizationTrack Track { get; private set; }
    public string? RegistrationNumber { get; private set; }
    public string? IssuingAuthorityName { get; private set; }
    public string? VerificationSourceUrl { get; private set; }
    public string PublicDescription { get; private set; } = null!;
    public string? City { get; private set; }
    public PublicationStatus Status { get; private set; } = PublicationStatus.Draft;
    public string? SuspensionReasonCode { get; private set; }

    public string DisplayName => TradeName ?? LegalName;

    public static Organization Create(
        string legalName, string? tradeName, OrganizationTrack track, string? registrationNumber,
        string? issuingAuthorityName, string? verificationSourceUrl, string publicDescription, string? city,
        IContentPolicyChecker policyChecker)
    {
        if (!Enum.IsDefined(track)) throw new DomainException("مسار الجهة غير معروف.");
        var org = new Organization
        {
            LegalName = Guard.Required(legalName, "الاسم الرسمي", 200),
            TradeName = Guard.Optional(tradeName, "الاسم التجاري", 200),
            Track = track,
            RegistrationNumber = Guard.Optional(registrationNumber, "رقم السجل", 100),
            IssuingAuthorityName = Guard.Optional(issuingAuthorityName, "جهة الإصدار", 200),
            VerificationSourceUrl = Guard.Optional(verificationSourceUrl, "رابط التحقق", 500),
            PublicDescription = Guard.Required(publicDescription, "الوصف العام", 2000),
            City = Guard.Optional(city, "المدينة", 100),
        };
        ContentPolicy.EnsureAllowed(policyChecker, "وصف الجهة", org.LegalName, org.TradeName, org.PublicDescription);
        return org;
    }

    public void UpdatePublicDetails(string? tradeName, string publicDescription, string? city, IContentPolicyChecker policyChecker)
    {
        var description = Guard.Required(publicDescription, "الوصف العام", 2000);
        var trade = Guard.Optional(tradeName, "الاسم التجاري", 200);
        ContentPolicy.EnsureAllowed(policyChecker, "وصف الجهة", trade, description);
        TradeName = trade;
        PublicDescription = description;
        City = Guard.Optional(city, "المدينة", 100);
    }

    /// <summary>بوابة النشر: لا نشر بلا توثيق ساري المفعول يخص هذه الجهة تحديداً.</summary>
    public void Publish(VerificationRecord verification, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(verification);
        if (verification.SubjectType != VerificationSubjectType.Organization || verification.SubjectId != Id)
            throw new DomainException("سجل التوثيق لا يخص هذه الجهة.");
        if (!verification.IsCurrentlyValid(nowUtc))
            throw new DomainException("لا يمكن نشر جهة بلا توثيق معتمد أو مشروط ساري المفعول.", "publication_gate");
        Status = PublicationStatus.Published;
        SuspensionReasonCode = null;
        Raise(new OrganizationPublishedEvent(Id));
    }

    public void Suspend(string reasonCode)
    {
        Status = PublicationStatus.Suspended;
        SuspensionReasonCode = Guard.Required(reasonCode, "سبب التعليق", 100);
        Raise(new OrganizationSuspendedEvent(Id, SuspensionReasonCode));
    }

    public void MarkRejected() => Status = PublicationStatus.Rejected;
}
