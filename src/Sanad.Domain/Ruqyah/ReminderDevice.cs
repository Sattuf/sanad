using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Ruqyah;

public enum ReminderSlot { Morning, Evening, Sleep }

/// <summary>
/// جهاز مسجَّل لتذكير الأذكار عبر Web Push (معيار المتصفح، بلا مزوّد خارجي). شخصي بالكامل ويُحذف مع الحساب.
/// الأوقات بتوقيت المستخدم المحلي (منطقة IANA)، ولكل وقت تاريخ آخر إرسال حتى لا يتكرر في اليوم نفسه.
/// </summary>
public sealed partial class ReminderDevice : BaseEntity
{
    public const int MaxPerUser = 10;

    /// <summary>نافذة الإرسال بعد الوقت المختار: لو تأخر الخادم لا يصل تذكير الصباح ظهراً.</summary>
    public static readonly TimeSpan SendWindow = TimeSpan.FromMinutes(30);

    private ReminderDevice() { }

    public Guid UserId { get; private set; }
    public string Endpoint { get; private set; } = null!;
    public string P256dh { get; private set; } = null!;
    public string Auth { get; private set; } = null!;
    public string TimeZone { get; private set; } = null!;
    public TimeOnly? MorningAt { get; private set; }
    public TimeOnly? EveningAt { get; private set; }
    public TimeOnly? SleepAt { get; private set; }
    public DateOnly? LastMorningOn { get; private set; }
    public DateOnly? LastEveningOn { get; private set; }
    public DateOnly? LastSleepOn { get; private set; }

    public static ReminderDevice Register(Guid userId, string endpoint, string p256dh, string auth, DateTimeOffset nowUtc)
    {
        var device = new ReminderDevice { CreatedAtUtc = nowUtc };
        device.Bind(userId, endpoint, p256dh, auth, nowUtc);
        return device;
    }

    /// <summary>المتصفح نفسه قد يُسجَّل بحساب آخر، أو يجدّد مفاتيحه — نحدّث الربط في مكانه.</summary>
    public void Bind(Guid userId, string endpoint, string p256dh, string auth, DateTimeOffset nowUtc)
    {
        if (string.IsNullOrWhiteSpace(endpoint) || endpoint.Length > 1000 || !endpoint.StartsWith("https://", StringComparison.Ordinal))
            throw new DomainException("عنوان الإشعارات غير صالح.");
        UserId = Guard.NotEmpty(userId, "المستخدم");
        Endpoint = endpoint;
        P256dh = ValidKey(p256dh, 200);
        Auth = ValidKey(auth, 100);
        UpdatedAtUtc = nowUtc;
    }

    public void Schedule(string timeZone, TimeOnly? morningAt, TimeOnly? eveningAt, TimeOnly? sleepAt, DateTimeOffset nowUtc)
    {
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _)) throw new DomainException("المنطقة الزمنية غير معروفة.");
        TimeZone = timeZone;
        MorningAt = morningAt;
        EveningAt = eveningAt;
        SleepAt = sleepAt;
        UpdatedAtUtc = nowUtc;
    }

    public TimeOnly? TimeOf(ReminderSlot slot) => slot switch
    {
        ReminderSlot.Morning => MorningAt,
        ReminderSlot.Evening => EveningAt,
        _ => SleepAt,
    };

    private DateOnly? LastSentOn(ReminderSlot slot) => slot switch
    {
        ReminderSlot.Morning => LastMorningOn,
        ReminderSlot.Evening => LastEveningOn,
        _ => LastSleepOn,
    };

    /// <summary>
    /// الأوقات التي حانت الآن ولم تُرسل لليوم المحلي الذي تخصه. يُفحص أمس أيضاً لأن نافذة وقت قبل منتصف الليل
    /// (النوم 23:50 مثلاً) تمتد إلى اليوم التالي.
    /// </summary>
    public IReadOnlyList<(ReminderSlot Slot, DateOnly Day)> DueSlots(DateTimeOffset nowUtc)
    {
        var local = TimeZoneInfo.ConvertTime(nowUtc, TimeZoneInfo.FindSystemTimeZoneById(TimeZone)).DateTime;
        var today = DateOnly.FromDateTime(local);
        var due = new List<(ReminderSlot, DateOnly)>();
        foreach (var slot in Enum.GetValues<ReminderSlot>())
        {
            if (TimeOf(slot) is not { } at) continue;
            foreach (var day in new[] { today, today.AddDays(-1) })
            {
                var scheduled = day.ToDateTime(at);
                if (local >= scheduled && local < scheduled + SendWindow && LastSentOn(slot) != day)
                {
                    due.Add((slot, day));
                    break;
                }
            }
        }
        return due;
    }

    public void MarkSent(ReminderSlot slot, DateOnly day)
    {
        switch (slot)
        {
            case ReminderSlot.Morning: LastMorningOn = day; break;
            case ReminderSlot.Evening: LastEveningOn = day; break;
            default: LastSleepOn = day; break;
        }
    }

    private static string ValidKey(string? value, int max)
    {
        if (value is null || value.Length > max || !KeyPattern().IsMatch(value)) throw new DomainException("مفاتيح الإشعارات غير صالحة.");
        return value;
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+={0,2}$")]
    private static partial Regex KeyPattern();
}
