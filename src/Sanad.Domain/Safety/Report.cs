using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Safety;

public enum ReportCategory { Impersonation, FinancialExploitation, Harassment, UnauthorizedClaim, PrivacyViolation, Other }
public enum ReportSeverity { Low, Medium, High, Critical }
public enum ReportStatus { Open, UnderInvestigation, Resolved, Escalated }
public enum ReportTargetType { UserAccount, ProviderProfile, Organization, Conversation }

public sealed record ReportSubmittedEvent(Guid ReportId, ReportSeverity Severity) : IDomainEvent;
public sealed record ReportReviewedEvent(Guid ReportId, Guid TargetSubjectId, bool Substantiated) : IDomainEvent;

public sealed class Report : BaseEntity, IAggregateRoot
{
    public const int MaxDescriptionLength = 3000;

    private Report() { }

    public Guid ReporterUserId { get; private set; }
    public Guid TargetSubjectId { get; private set; }
    public ReportTargetType TargetType { get; private set; }

    /// <summary>الحساب المعني بالتصعيد (مستخدم أو جهة) — يُحدَّد عند الإنشاء من الهدف.</summary>
    public Guid EscalationSubjectId { get; private set; }
    public ReportCategory Category { get; private set; }
    public ReportSeverity Severity { get; private set; }
    public ReportStatus Status { get; private set; } = ReportStatus.Open;

    /// <summary>وصف البلاغ مشفّر — قد يحوي تفاصيل حساسة عن المُبلِّغ.</summary>
    public string? DescriptionEncrypted { get; private set; }
    public bool? IsSubstantiated { get; private set; }
    public bool InvolvesPossibleCrimeOrMinorRisk { get; private set; }
    public Guid? ReviewedByCoordinatorId { get; private set; }
    public DateTimeOffset SubmittedAtUtc { get; private set; }
    public DateTimeOffset? ReviewedAtUtc { get; private set; }

    public static Report Submit(
        Guid reporterUserId, Guid targetSubjectId, ReportTargetType targetType, Guid escalationSubjectId,
        ReportCategory category, ReportSeverity severity, string? plainDescription,
        IFieldEncryptor encryptor, ISafeReferralEvaluator riskEvaluator, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(encryptor);
        ArgumentNullException.ThrowIfNull(riskEvaluator);
        if (!Enum.IsDefined(category) || !Enum.IsDefined(severity) || !Enum.IsDefined(targetType))
            throw new DomainException("تصنيف البلاغ غير معروف.");
        if (reporterUserId == targetSubjectId) throw new DomainException("لا يمكن الإبلاغ عن نفسك.");

        var report = new Report
        {
            ReporterUserId = Guard.NotEmpty(reporterUserId, "المُبلِّغ"),
            TargetSubjectId = Guard.NotEmpty(targetSubjectId, "الهدف"),
            TargetType = targetType,
            EscalationSubjectId = Guard.NotEmpty(escalationSubjectId, "الحساب المعني"),
            Category = category,
            Severity = severity,
            SubmittedAtUtc = nowUtc,
        };

        var description = Guard.Optional(plainDescription, "وصف البلاغ", MaxDescriptionLength);
        if (description is not null)
        {
            report.DescriptionEncrypted = encryptor.Encrypt(description);
            if (riskEvaluator.RequiresImmediateEmergencyReferral(new SafetySignal(description)))
                report.Raise(new EmergencyReferralTriggeredEvent(reporterUserId, EmergencySignalSource.Report, report.Id));
        }

        report.Raise(new ReportSubmittedEvent(report.Id, severity));
        return report;
    }

    public void StartInvestigation(Guid coordinatorId)
    {
        if (Status != ReportStatus.Open) throw new DomainException("البلاغ ليس مفتوحاً.", "invalid_state");
        Status = ReportStatus.UnderInvestigation;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
    }

    /// <summary>قرار المنسق: هل البلاغ موثَّق (Substantiated)؟ البلاغات الموثَّقة فقط تُحتسب في التصعيد.</summary>
    public void Review(Guid coordinatorId, bool substantiated, bool involvesPossibleCrimeOrMinorRisk, DateTimeOffset nowUtc)
    {
        if (Status is ReportStatus.Resolved or ReportStatus.Escalated) throw new DomainException("تمت مراجعة البلاغ مسبقاً.", "invalid_state");
        IsSubstantiated = substantiated;
        InvolvesPossibleCrimeOrMinorRisk = substantiated && involvesPossibleCrimeOrMinorRisk;
        ReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        ReviewedAtUtc = nowUtc;
        Status = substantiated ? ReportStatus.Escalated : ReportStatus.Resolved;
        Raise(new ReportReviewedEvent(Id, TargetSubjectId, substantiated));
    }

    /// <summary>عند حذف حساب المُبلِّغ: تجريد الهوية ومحو الوصف الشخصي، مع بقاء أثر البلاغ للتصعيد.</summary>
    public void AnonymizeReporter(Guid anonymousUserId)
    {
        ReporterUserId = anonymousUserId;
        DescriptionEncrypted = null;
    }
}
