using Microsoft.AspNetCore.Identity;

namespace Sanad.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "مستخدم سند";
    public bool MustChangePassword { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? DeletedAtUtc { get; set; }

    /// <summary>متى أكّد المستخدم تطبيق المصادقة برمز صحيح. مفتاح مولَّد بلا تأكيد لا يُعتدّ به.</summary>
    public DateTimeOffset? AuthenticatorConfirmedAtUtc { get; set; }

    /// <summary>إخفاء اسمي الظاهر عن المختص حتى يقبل طلب الحجز (حالة Accepted فما بعدها).</summary>
    public bool HideIdentityUntilBookingConfirmed { get; set; }

    /// <summary>ساعات هدوء (بتوقيت UTC، 0–23) لا تُرسَل خلالها إشعارات غير عاجلة عبر القنوات الخارجية. كلاهما أو لا شيء.</summary>
    public int? QuietHoursStartHourUtc { get; set; }
    public int? QuietHoursEndHourUtc { get; set; }
}

public sealed class ApplicationRole : IdentityRole<Guid>
{
    public ApplicationRole() { }

    public ApplicationRole(string name) : base(name) { }
}

/// <summary>رمز تحديث — يُخزَّن كبصمة SHA-256 فقط، مع تدوير عند كل استخدام وكشف إعادة الاستخدام.</summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = null!;
    public string AuthMethod { get; set; } = null!;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? ReplacedByTokenHash { get; set; }
}

/// <summary>تحدي OTP — الرمز مخزَّن كـ HMAC فقط، صلاحية 5 دقائق، 5 محاولات كحد أقصى.</summary>
public sealed class OtpChallenge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string PhoneNumberE164 { get; set; } = null!;
    public string CodeHash { get; set; } = null!;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public int FailedAttempts { get; set; }
    public DateTimeOffset? ConsumedAtUtc { get; set; }
}
