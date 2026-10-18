using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

/// <summary>
/// المؤشرات (product-spec.md §7) كعدّادات يومية مجمّعة فقط: اسم حدث من قائمة ثابتة وبُعد واحد (مدة أو نوع) —
/// لا معرّف مستخدم ولا جهاز ولا عنوان IP ولا أي نص كتبه المستخدم. لا يمكن منها تتبّع شخص.
/// </summary>
public sealed class CompanionEventCounter : BaseEntity
{
    public static readonly IReadOnlyDictionary<string, string[]> AllowedEvents = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["plan_started"] = ["7", "14", "21", "40"],
        ["wird_completed"] = ["7", "14", "21", "40"],
        ["plan_completed"] = ["7", "14", "21", "40"],
        ["khatma_juz_done"] = ["solo", "group"],
        ["khatma_completed"] = ["solo", "group"],
        ["khatma_invite_accepted"] = ["group"],
        ["first_open"] = ["web"],
    };

    private CompanionEventCounter() { }

    public DateOnly Day { get; private set; }
    public string Name { get; private set; } = null!;
    public string Dimension { get; private set; } = null!;
    public long Count { get; private set; }

    public static bool IsAllowed(string? name, string? dimension) =>
        name is not null && dimension is not null && AllowedEvents.TryGetValue(name, out var dims) && dims.Contains(dimension);

    public static CompanionEventCounter Start(DateOnly day, string name, string dimension, DateTimeOffset nowUtc)
    {
        if (!IsAllowed(name, dimension)) throw new DomainException("حدث غير معروف.");
        return new CompanionEventCounter { Day = day, Name = name, Dimension = dimension, CreatedAtUtc = nowUtc };
    }

    public void Add(int n)
    {
        if (n is < 1 or > 50) throw new DomainException("عدد غير صالح.");
        Count += n;
    }
}
