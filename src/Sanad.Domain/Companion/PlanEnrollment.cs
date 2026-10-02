using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

public enum WirdReminder { AfterFajr, AfterMaghrib, BeforeSleep }

/// <summary>
/// تسجيل المستخدم في خطة، للمزامنة بين أجهزته. شخصي بالكامل ويُحذف مع الحساب.
/// لا يُخزَّن فيه أي شيء عن حال المستخدم — لا حقل لذلك أصلاً. والانقطاع لا يُعاقَب: يكمل من أول يوم لم يكتمل.
/// خطة واحدة نشطة لكل مستخدم في الوقت نفسه.
/// </summary>
public sealed class PlanEnrollment : BaseEntity
{
    private PlanEnrollment() { }

    public Guid UserId { get; private set; }
    public Guid PlanId { get; private set; }
    public string PlanKey { get; private set; } = null!;
    public int PlanVersion { get; private set; }
    public int DurationDays { get; private set; }
    public DateTimeOffset StartedAtUtc { get; private set; }
    public List<int> CompletedDays { get; private set; } = new();
    public DateOnly? LastCompletedOn { get; private set; }
    public WirdReminder? Reminder { get; private set; }
    public bool IsActive { get; private set; }
    public DateTimeOffset? EndedAtUtc { get; private set; }

    public bool IsFinished => CompletedDays.Count >= DurationDays;

    public int CurrentDay
    {
        get
        {
            for (var d = 1; d <= DurationDays; d++) if (!CompletedDays.Contains(d)) return d;
            return DurationDays;
        }
    }

    public static PlanEnrollment Start(Guid userId, RuqyahPlan plan, WirdReminder? reminder, DateTimeOffset nowUtc)
    {
        if (plan.Status != PlanStatus.Published) throw new DomainException("يُبدأ في الخطة المنشورة فقط.", "invalid_state");
        return new PlanEnrollment
        {
            UserId = Guard.NotEmpty(userId, "المستخدم"),
            PlanId = plan.Id,
            PlanKey = plan.Key,
            PlanVersion = plan.Version,
            DurationDays = plan.DurationDays,
            StartedAtUtc = nowUtc,
            Reminder = reminder,
            IsActive = true,
            CreatedAtUtc = nowUtc,
        };
    }

    /// <summary>
    /// تسجيل أيام مكتملة من جهاز المستخدم (يعمل دون اتصال ثم يزامن): اتحاد مع ما في الحساب، فلا يضيع يوم من أي جهاز.
    /// </summary>
    public void RecordCompletedDays(IReadOnlyCollection<int> days, DateOnly? lastCompletedOn, DateTimeOffset nowUtc)
    {
        if (!IsActive) throw new DomainException("هذه الخطة متوقفة.", "invalid_state");
        if (days.Count > DurationDays || days.Any(d => d < 1 || d > DurationDays)) throw new DomainException("أيام الخطة غير صالحة.");
        var merged = CompletedDays.Union(days).Distinct().OrderBy(d => d).ToList();
        if (merged.Count == CompletedDays.Count) return;
        CompletedDays = merged;
        if (lastCompletedOn is { } l && (LastCompletedOn is null || l > LastCompletedOn)) LastCompletedOn = l;
        UpdatedAtUtc = nowUtc;
    }

    public void SetReminder(WirdReminder? reminder, DateTimeOffset nowUtc)
    {
        Reminder = reminder;
        UpdatedAtUtc = nowUtc;
    }

    public void Stop(DateTimeOffset nowUtc)
    {
        if (!IsActive) return;
        IsActive = false;
        EndedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }
}
