using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Safety;

public enum EscalationLevel { Warning, Restriction, Suspension, RegulatoryReferral }

public sealed record EscalationLevelChangedEvent(Guid EscalationCaseId, Guid SubjectAccountId, EscalationLevel Level) : IDomainEvent;

/// <summary>
/// تصعيد تدريجي على حساب. المستوى يرتفع تلقائياً مع البلاغات الموثَّقة، لكنه لا ينخفض أبداً
/// تلقائياً — أي خفض يتطلب مراجعة منسق صريحة (reviewedByCoordinatorId).
/// </summary>
public sealed class EscalationCase : BaseEntity, IAggregateRoot
{
    public static readonly TimeSpan CountingWindow = TimeSpan.FromDays(180);

    private EscalationCase() { }

    public Guid SubjectAccountId { get; private set; }
    public EscalationLevel Level { get; private set; } = EscalationLevel.Warning;
    public int DocumentedReportsCount { get; private set; }
    public bool IsOpen { get; private set; } = true;
    public Guid? LastReviewedByCoordinatorId { get; private set; }
    public DateTimeOffset? LastRecomputedAtUtc { get; private set; }

    public static EscalationCase Open(Guid subjectAccountId) =>
        new() { SubjectAccountId = Guard.NotEmpty(subjectAccountId, "الحساب المعني") };

    public static EscalationLevel ComputeLevel(int documentedReportsInWindow, bool hasSevereSingleViolation, bool possibleCrimeOrMinorRisk) =>
        possibleCrimeOrMinorRisk ? EscalationLevel.RegulatoryReferral
        : hasSevereSingleViolation || documentedReportsInWindow >= 3 ? EscalationLevel.Suspension
        : documentedReportsInWindow >= 2 ? EscalationLevel.Restriction
        : EscalationLevel.Warning;

    public void Recompute(int documentedReportsInWindow, bool hasSevereSingleViolation, bool possibleCrimeOrMinorRisk,
        Guid? reviewedByCoordinatorId, DateTimeOffset nowUtc)
    {
        if (documentedReportsInWindow < 0) throw new DomainException("عدد البلاغات غير صالح.");
        var computed = ComputeLevel(documentedReportsInWindow, hasSevereSingleViolation, possibleCrimeOrMinorRisk);
        DocumentedReportsCount = documentedReportsInWindow;
        LastRecomputedAtUtc = nowUtc;

        // لا تراجع تلقائي: خفض المستوى يتطلب منسقاً مراجِعاً بشكل صريح
        if (computed < Level && reviewedByCoordinatorId is null) return;

        if (reviewedByCoordinatorId is { } coordinatorId) LastReviewedByCoordinatorId = coordinatorId;
        if (computed == Level) return;
        Level = computed;
        Raise(new EscalationLevelChangedEvent(Id, SubjectAccountId, Level));
    }

    public void Close(Guid coordinatorId)
    {
        LastReviewedByCoordinatorId = Guard.NotEmpty(coordinatorId, "المنسق");
        IsOpen = false;
    }
}
