using Sanad.Domain.Identity;

namespace Sanad.Application.Common.Interfaces;

public enum SignInStage { Succeeded, RequiresPasswordChange, RequiresTwoFactorSetup, RequiresTwoFactorCode }

public sealed record AuthTokens(string AccessToken, DateTimeOffset AccessTokenExpiresAtUtc, string RefreshToken, DateTimeOffset RefreshTokenExpiresAtUtc);

/// <summary>
/// نتيجة تسجيل الدخول. عند مرحلة وسيطة (تغيير كلمة مرور، إعداد/إدخال 2FA) تُعاد Ticket مؤقتة
/// قصيرة الأجل بدل الرموز — لا وصول لأي Endpoint قبل إكمال المراحل.
/// </summary>
public sealed record AuthResult(Guid UserId, SignInStage Stage, AuthTokens? Tokens, string? Ticket, bool IsNewUser);

public sealed record TwoFactorSetupInfo(string SharedKey, string AuthenticatorUri);

public sealed record UserSummary(Guid Id, string? Email, string? PhoneNumber, string DisplayName, IReadOnlyList<string> Roles,
    bool TwoFactorEnabled, DateTimeOffset CreatedAtUtc, bool IsDeleted, bool EmailConfirmed = false,
    bool HideIdentityUntilBookingConfirmed = false, int? QuietHoursStartHourUtc = null, int? QuietHoursEndHourUtc = null);

public sealed record UserPage(IReadOnlyList<UserSummary> Items, int Total);

public interface IIdentityService
{
    Task<AuthResult> RegisterWithEmailAsync(string email, string password, string displayName, CancellationToken ct);
    Task<AuthResult> LoginWithEmailAsync(string email, string password, CancellationToken ct);
    Task<AuthResult> CompleteGoogleLoginAsync(string externalProviderKey, string verifiedEmail, string? displayName, CancellationToken ct);
    Task RequestPhoneOtpAsync(string phoneNumberE164, CancellationToken ct);

    /// <summary>البريد اختياري — يُرفَق بحساب جديد، أو يُستكمل لحساب هاتف قائم بلا بريد.</summary>
    Task<AuthResult> VerifyPhoneOtpAsync(string phoneNumberE164, string code, string? email, CancellationToken ct);

    Task<AuthResult> ChangeRequiredPasswordAsync(string ticket, string newPassword, CancellationToken ct);
    Task<TwoFactorSetupInfo> BeginTwoFactorSetupAsync(string ticket, CancellationToken ct);
    Task<AuthResult> CompleteTwoFactorSetupAsync(string ticket, string code, CancellationToken ct);
    Task<AuthResult> VerifyTwoFactorAsync(string ticket, string code, CancellationToken ct);

    Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken ct);
    Task RevokeAsync(Guid userId, string? refreshToken, string? accessTokenJti, DateTimeOffset? accessTokenExpiresAtUtc, CancellationToken ct);

    Task<UserSummary?> GetUserAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(IEnumerable<Guid> userIds, CancellationToken ct);
    Task<IReadOnlyList<Guid>> GetUserIdsInRoleAsync(SanadRole role, CancellationToken ct);
    Task<UserPage> SearchUsersAsync(string? search, int page, int pageSize, CancellationToken ct);
    Task UpdateDisplayNameAsync(Guid userId, string displayName, CancellationToken ct);

    /// <summary>تفضيلات الخصوصية والإشعارات: إخفاء الاسم قبل تأكيد الحجز، وساعات الهدوء (UTC).</summary>
    Task UpdatePrivacyPreferencesAsync(Guid userId, bool hideIdentityUntilBookingConfirmed,
        int? quietHoursStartHourUtc, int? quietHoursEndHourUtc, CancellationToken ct);

    /// <summary>هل يفضّل كل من هؤلاء المستخدمين (كمستفيدين) إخفاء اسمهم عن المختص قبل تأكيد الحجز؟</summary>
    Task<IReadOnlyDictionary<Guid, bool>> GetHideIdentityPreferencesAsync(IEnumerable<Guid> userIds, CancellationToken ct);

    /// <summary>منح الأدوار — الآلية الرسمية الوحيدة. الأدوار الحساسة تفرض 2FA فوراً.</summary>
    Task AssignRoleAsync(Guid userId, SanadRole role, Guid assignedByUserId, CancellationToken ct);
    Task RemoveRoleAsync(Guid userId, SanadRole role, Guid removedByUserId, CancellationToken ct);

    /// <summary>حذف الحساب: محو البيانات الشخصية القابلة للتحديد، وإبطال كل الجلسات.</summary>
    Task DeletePersonalDataAsync(Guid userId, CancellationToken ct);
}
