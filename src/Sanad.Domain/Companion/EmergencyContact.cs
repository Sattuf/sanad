using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

public enum EmergencyContactStatus { Pending, Verified }

/// <summary>
/// رقم طوارئ لبلد — جدول تحرّره الإدارة ويُراجع دورياً (content-guardrails.md §4). لا يُكتب رقم من ذاكرة أحد:
/// من يُدخل الرقم لا يعتمده؛ يعتمده موظف آخر بعد التحقق من مصدر رسمي يذكره. أي تعديل يعيده «بانتظار التحقق»
/// فلا يُعرض للعامة. الرقم المعتمد يُعدّ متقادماً بعد ReviewInterval ويظهر للإدارة للمراجعة، ويبقى معروضاً حتى ذلك.
/// </summary>
public sealed partial class EmergencyContact : BaseEntity, IAggregateRoot
{
    public static readonly TimeSpan ReviewInterval = TimeSpan.FromDays(180);

    /// <summary>رمز «دولي» لجهات تعمل من أي بلد.</summary>
    public const string International = "ZZ";

    private EmergencyContact() { }

    public string CountryCode { get; private set; } = null!;
    public string Label { get; private set; } = null!;
    public string PhoneNumber { get; private set; } = null!;
    public string SourceRef { get; private set; } = null!;
    public int SortOrder { get; private set; }
    public EmergencyContactStatus Status { get; private set; }
    public Guid EditedByUserId { get; private set; }
    public Guid? VerifiedByUserId { get; private set; }
    public DateTimeOffset? VerifiedAtUtc { get; private set; }

    public bool IsStale(DateTimeOffset nowUtc) => VerifiedAtUtc is null || nowUtc - VerifiedAtUtc > ReviewInterval;

    public static EmergencyContact Create(string countryCode, string label, string phoneNumber, string sourceRef, int sortOrder,
        Guid editedBy, DateTimeOffset nowUtc)
    {
        var c = new EmergencyContact { CreatedAtUtc = nowUtc };
        c.Apply(countryCode, label, phoneNumber, sourceRef, sortOrder, editedBy);
        return c;
    }

    public void Update(string countryCode, string label, string phoneNumber, string sourceRef, int sortOrder, Guid editedBy, DateTimeOffset nowUtc)
    {
        Apply(countryCode, label, phoneNumber, sourceRef, sortOrder, editedBy);
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>اعتماد أو إعادة اعتماد دورية — من موظف غير آخر من عدّل الرقم.</summary>
    public void Verify(Guid verifierUserId, DateTimeOffset nowUtc)
    {
        if (Guard.NotEmpty(verifierUserId, "المعتمِد") == EditedByUserId)
            throw new DomainException("يعتمد الرقمَ موظفٌ غير من أدخله أو عدّله.", "self_review");
        Status = EmergencyContactStatus.Verified;
        VerifiedByUserId = verifierUserId;
        VerifiedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    private void Apply(string countryCode, string label, string phoneNumber, string sourceRef, int sortOrder, Guid editedBy)
    {
        var cc = (countryCode ?? string.Empty).Trim().ToUpperInvariant();
        if (!CountryPattern().IsMatch(cc)) throw new DomainException("رمز البلد حرفان لاتينيان (ISO 3166)، أو ZZ للدولي.");
        var phone = (phoneNumber ?? string.Empty).Trim();
        if (!PhonePattern().IsMatch(phone)) throw new DomainException("رقم الطوارئ أرقام فقط (مع + في أوله إن لزم)، من 2 إلى 16.");
        if (sortOrder is < 0 or > 1000) throw new DomainException("ترتيب العرض غير صالح.");
        CountryCode = cc;
        Label = Guard.Required(label, "وصف الجهة", 80);
        PhoneNumber = phone;
        SourceRef = Guard.Required(sourceRef, "المصدر الرسمي", 300);
        SortOrder = sortOrder;
        EditedByUserId = Guard.NotEmpty(editedBy, "المحرّر");
        Status = EmergencyContactStatus.Pending;
        VerifiedByUserId = null;
        VerifiedAtUtc = null;
    }

    [GeneratedRegex("^[A-Z]{2}$")]
    private static partial Regex CountryPattern();

    [GeneratedRegex(@"^\+?[0-9]{2,15}$")]
    private static partial Regex PhonePattern();
}

/// <summary>
/// المؤشرات (product-spec.md §7) كعدّادات يومية مجمّعة فقط: اسم حدث من قائمة ثابتة وبُعد واحد (مدة أو نوع) —
/// لا معرّف مستخدم ولا جهاز ولا عنوان IP ولا أي نص كتبه المستخدم. لا يمكن منها تتبّع شخص.
/// </summary>
public sealed partial class CompanionEventCounter : BaseEntity
{
    public static readonly IReadOnlyDictionary<string, string[]> AllowedEvents = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["plan_started"] = ["7", "14", "21", "40"],
        ["wird_completed"] = ["7", "14", "21", "40"],
        ["plan_completed"] = ["7", "14", "21", "40"],
        ["khatma_juz_done"] = ["solo", "group"],
        ["khatma_completed"] = ["solo", "group"],
        ["khatma_invite_accepted"] = ["group"],
        ["safety_page_opened"] = ["today", "plans", "plan", "reader", "khatma", "support", "header", "other"],
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
