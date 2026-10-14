using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Ruqyah;

/// <summary>
/// تقدّم المستخدم في مجموعة أذكار ليوم واحد (بتاريخ جهازه المحلي). شخصي بالكامل: لا يراه أحد غيره،
/// ويُحذف مع حذف الحساب. Counts: عدد مرات كل عنصر بمفتاحه الثابت في المجموعة.
/// </summary>
public sealed partial class DailyWirdProgress : BaseEntity
{
    public const int MaxItems = 200;
    public const int MaxCount = 1000;

    private DailyWirdProgress() { }

    public Guid UserId { get; private set; }
    public string CollectionId { get; private set; } = null!;
    public DateOnly Day { get; private set; }
    public Dictionary<string, int> Counts { get; private set; } = new();
    public int CompletedItems { get; private set; }
    public int TotalItems { get; private set; }
    public bool IsComplete => TotalItems > 0 && CompletedItems >= TotalItems;

    public static DailyWirdProgress Start(Guid userId, string collectionId, DateOnly day, DateTimeOffset nowUtc) => new()
    {
        UserId = Guard.NotEmpty(userId, "المستخدم"),
        CollectionId = ValidKey(collectionId, "المجموعة"),
        Day = day,
        CreatedAtUtc = nowUtc,
    };

    public void Record(IReadOnlyDictionary<string, int> counts, int completedItems, int totalItems, DateTimeOffset nowUtc)
    {
        if (counts.Count > MaxItems || totalItems is < 1 or > MaxItems || completedItems < 0 || completedItems > totalItems)
            throw new DomainException("بيانات الورد غير صالحة.");
        var clean = new Dictionary<string, int>(counts.Count);
        foreach (var (key, value) in counts)
        {
            if (value is < 0 or > MaxCount) throw new DomainException("عدد التكرار غير صالح.");
            if (value > 0) clean[ValidKey(key, "العنصر")] = value;
        }
        Counts = clean;
        CompletedItems = completedItems;
        TotalItems = totalItems;
        UpdatedAtUtc = nowUtc;
    }

    private static string ValidKey(string? value, string label)
    {
        if (value is null || !KeyPattern().IsMatch(value)) throw new DomainException($"معرّف «{label}» غير صالح.");
        return value;
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9:-]{0,59}$")]
    private static partial Regex KeyPattern();
}
