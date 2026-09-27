using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Domain.Directory;

public enum ServiceDeliveryMode { InPerson, Remote, Both }

public sealed record ProviderProfileCreatedEvent(Guid ProviderProfileId, Guid UserId) : IDomainEvent;
public sealed record ProviderProfilePublishedEvent(Guid ProviderProfileId) : IDomainEvent;
public sealed record ProviderProfileSuspendedEvent(Guid ProviderProfileId, Guid UserId, string ReasonCode) : IDomainEvent;

/// <summary>
/// ملف مقدّم خدمة موثّق. يُنشأ فقط عند اعتماد طلب ترقية (لا عند التسجيل).
/// ترتيب البحث من مطابقة الطلب وحالة التوثيق فقط — Type لا يمنح أي أفضلية عرض.
/// </summary>
public sealed class ProviderProfile : BaseEntity, IAggregateRoot
{
    private ProviderProfile() { }

    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public PractitionerType Type { get; private set; }
    public string DisplayName { get; private set; } = null!;
    public string DeclaredTitle { get; private set; } = null!;
    public string PracticeScope { get; private set; } = string.Empty;
    public List<string> Languages { get; private set; } = new();
    public ServiceDeliveryMode DeliveryMode { get; private set; } = ServiceDeliveryMode.Remote;
    public string? City { get; private set; }
    public string ProfessionalBoundariesNote { get; private set; } = string.Empty;
    public PublicationStatus Status { get; private set; } = PublicationStatus.Draft;
    public Guid VerificationRecordId { get; private set; }
    public string? SuspensionReasonCode { get; private set; }

    /// <summary>ينشئ الملف من طلب ترقية معتمد. معرّف الملف = SubjectId المولَّد مسبقاً في سجل التوثيق.</summary>
    public static ProviderProfile CreateFromApprovedUpgrade(VerificationRecord approved, string displayName, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(approved);
        if (approved.SubjectType != VerificationSubjectType.ProviderProfile ||
            approved.ApplicantUserId is not { } userId || approved.DeclaredPractitionerType is not { } type)
            throw new DomainException("سجل التوثيق ليس طلب ترقية مختص.");
        if (!approved.IsCurrentlyValid(nowUtc))
            throw new DomainException("لا يُنشأ ملف مختص إلا من توثيق معتمد ساري.");

        var profile = new ProviderProfile
        {
            Id = approved.SubjectId,
            UserId = userId,
            Type = type,
            DisplayName = Guard.Required(displayName, "الاسم الظاهر", 150),
            DeclaredTitle = approved.DeclaredTitle ?? string.Empty,
            VerificationRecordId = approved.Id,
        };
        profile.Raise(new ProviderProfileCreatedEvent(profile.Id, userId));
        return profile;
    }

    public void UpdateProfile(
        string displayName, string declaredTitle, string practiceScope, IEnumerable<string> languages,
        ServiceDeliveryMode deliveryMode, string? city, string professionalBoundariesNote, IContentPolicyChecker policyChecker)
    {
        if (!Enum.IsDefined(deliveryMode)) throw new DomainException("طريقة تقديم الخدمة غير معروفة.");
        var name = Guard.Required(displayName, "الاسم الظاهر", 150);
        var title = Guard.Required(declaredTitle, "اللقب المهني", 200);
        var scope = Guard.Required(practiceScope, "نطاق الممارسة", 2000);
        var boundaries = Guard.Required(professionalBoundariesNote, "حدود الممارسة المهنية", 1000);
        var langs = (languages ?? []).Select(l => Guard.Required(l, "اللغة", 40)).Distinct().Take(10).ToList();
        if (langs.Count == 0) throw new DomainException("لغة واحدة على الأقل مطلوبة.");

        ContentPolicy.EnsureAllowed(policyChecker, "الملف المهني", name, title, scope, boundaries);

        DisplayName = name;
        DeclaredTitle = title;
        PracticeScope = scope;
        Languages = langs;
        DeliveryMode = deliveryMode;
        City = Guard.Optional(city, "المدينة", 100);
        ProfessionalBoundariesNote = boundaries;
    }

    public bool IsProfileComplete =>
        !string.IsNullOrWhiteSpace(PracticeScope) && !string.IsNullOrWhiteSpace(ProfessionalBoundariesNote) && Languages.Count > 0;

    /// <summary>بوابة النشر: توثيق ساري يخص هذا الملف + ملف مكتمل + غير معلَّق.</summary>
    public void Publish(VerificationRecord verification, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(verification);
        if (verification.SubjectType != VerificationSubjectType.ProviderProfile || verification.SubjectId != Id)
            throw new DomainException("سجل التوثيق لا يخص هذا الملف.");
        if (!verification.IsCurrentlyValid(nowUtc))
            throw new DomainException("لا يمكن نشر ملف بلا توثيق معتمد أو مشروط ساري المفعول.", "publication_gate");
        if (Status == PublicationStatus.Suspended)
            throw new DomainException("الملف معلَّق إدارياً — يلزم رفع التعليق من المنسق أولاً.", "publication_gate");
        if (!IsProfileComplete)
            throw new DomainException("أكمل نطاق الممارسة وحدودها واللغات قبل النشر.", "publication_gate");
        Status = PublicationStatus.Published;
        Raise(new ProviderProfilePublishedEvent(Id));
    }

    public void Suspend(string reasonCode)
    {
        Status = PublicationStatus.Suspended;
        SuspensionReasonCode = Guard.Required(reasonCode, "سبب التعليق", 100);
        Raise(new ProviderProfileSuspendedEvent(Id, UserId, SuspensionReasonCode));
    }

    /// <summary>رفع التعليق يعيد الملف مسودة؛ إعادة النشر تمر ببوابة النشر من جديد.</summary>
    public void LiftSuspension()
    {
        if (Status != PublicationStatus.Suspended) throw new DomainException("الملف غير معلَّق.");
        Status = PublicationStatus.Draft;
        SuspensionReasonCode = null;
    }

    public void AttachToOrganization(Guid? organizationId) => OrganizationId = organizationId;

    public void ReplaceVerification(VerificationRecord verification)
    {
        ArgumentNullException.ThrowIfNull(verification);
        if (verification.SubjectId != Id) throw new DomainException("سجل التوثيق لا يخص هذا الملف.");
        VerificationRecordId = verification.Id;
    }
}
