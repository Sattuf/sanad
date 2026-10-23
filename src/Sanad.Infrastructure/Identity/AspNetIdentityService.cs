using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Identity;

/// <summary>
/// تسجيل الدخول متعدد الطرق (بريد / جوجل / هاتف OTP). نجاح أي طريقة يثبت الهوية فقط ويمنح دور Beneficiary فوراً
/// بلا أي مستند — الاعتماد كمقدّم خدمة قرار إداري منفصل تماماً (IdentityVerified ≠ AdministrativelyApproved).
/// </summary>
public sealed class AspNetIdentityService(
    UserManager<ApplicationUser> userManager,
    SanadDbContext db,
    JwtTokenService tokens,
    TokenRevocationStore revocations,
    SignInTicketStore tickets,
    IOtpService otp,
    IAuditLogger audit,
    IDateTime clock,
    IOptions<JwtOptions> jwtOptions) : IIdentityService
{
    private const string AuthenticatorIssuer = "Sanad";

    // ── البريد ────────────────────────────────────────────────────────────────
    public async Task<AuthResult> RegisterWithEmailAsync(string email, string password, string displayName, CancellationToken ct)
    {
        var user = new ApplicationUser { Email = email, UserName = email, DisplayName = displayName, CreatedAtUtc = clock.UtcNow };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded) throw ToValidation(result, "email");
        await userManager.AddToRoleAsync(user, SanadRoles.Beneficiary); // دور افتراضي فوري، بلا أي مستند
        return await ContinueSignInAsync(user, SanadClaims.MethodPassword, isNewUser: true, ct);
    }

    public async Task<AuthResult> LoginWithEmailAsync(string email, string password, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(email);
        if (user is null || user.DeletedAtUtc is not null) throw new AuthenticationFailedException();
        if (await userManager.IsLockedOutAsync(user)) throw new AuthenticationFailedException("الحساب مقفل مؤقتاً بسبب محاولات متكررة. حاول لاحقاً.");
        if (!await userManager.CheckPasswordAsync(user, password))
        {
            await userManager.AccessFailedAsync(user);
            throw new AuthenticationFailedException();
        }
        await userManager.ResetAccessFailedCountAsync(user);
        return await ContinueSignInAsync(user, SanadClaims.MethodPassword, isNewUser: false, ct);
    }

    // ── جوجل ──────────────────────────────────────────────────────────────────
    public Task<AuthResult> CompleteGoogleLoginAsync(string externalProviderKey, string verifiedEmail, string? displayName, CancellationToken ct) =>
        CompleteExternalLoginAsync(ExternalLoginProvider.Google, externalProviderKey, verifiedEmail, displayName, ct);

    /// <summary>
    /// دخول بمزود خارجي (جوجل/أبل) بعد التحقق من رمزه: حساب مربوط بهذا المعرّف ← نفسه؛ وإلا بريد موثّق ← ربط بالحساب القائم
    /// بنفس البريد أو إنشاء حساب مستفيد جديد. أبل قد لا ترسل البريد بعد أول دخول — يكفي المعرّف حينها إن كان مربوطاً.
    /// </summary>
    public async Task<AuthResult> CompleteExternalLoginAsync(ExternalLoginProvider provider, string externalProviderKey, string? verifiedEmail,
        string? displayName, CancellationToken ct)
    {
        var (name, method) = provider switch
        {
            ExternalLoginProvider.Google => ("Google", SanadClaims.MethodGoogle),
            ExternalLoginProvider.Apple => ("Apple", SanadClaims.MethodApple),
            _ => throw new ArgumentOutOfRangeException(nameof(provider)),
        };
        var isNew = false;
        var user = await userManager.FindByLoginAsync(name, externalProviderKey);
        if (user is null)
        {
            if (string.IsNullOrWhiteSpace(verifiedEmail))
                throw new AuthenticationFailedException("تعذّر الحصول على بريد موثّق من مزود الدخول. حاول بطريقة أخرى.");
            user = await userManager.FindByEmailAsync(verifiedEmail);
            if (user is null)
            {
                isNew = true;
                user = new ApplicationUser
                {
                    Email = verifiedEmail,
                    UserName = verifiedEmail,
                    EmailConfirmed = true,
                    CreatedAtUtc = clock.UtcNow,
                    DisplayName = string.IsNullOrWhiteSpace(displayName) ? "مستخدم سند" : displayName.Trim()[..Math.Min(100, displayName.Trim().Length)],
                };
                var created = await userManager.CreateAsync(user);
                if (!created.Succeeded) throw ToValidation(created, "email");
                await userManager.AddToRoleAsync(user, SanadRoles.Beneficiary);
            }
            if (user.DeletedAtUtc is not null) throw new AuthenticationFailedException();
            var linked = await userManager.AddLoginAsync(user, new UserLoginInfo(name, externalProviderKey, name));
            if (!linked.Succeeded) throw ToValidation(linked, name.ToLowerInvariant());
        }
        if (user.DeletedAtUtc is not null) throw new AuthenticationFailedException();
        return await ContinueSignInAsync(user, method, isNew, ct);
    }

    // ── الهاتف OTP ─────────────────────────────────────────────────────────────
    public Task RequestPhoneOtpAsync(string phoneNumberE164, CancellationToken ct) => otp.SendOtpAsync(phoneNumberE164, ct);

    public async Task<AuthResult> VerifyPhoneOtpAsync(string phoneNumberE164, string code, string? email, CancellationToken ct)
    {
        if (!await otp.VerifyOtpAsync(phoneNumberE164, code, ct))
            throw new AuthenticationFailedException("رمز التحقق غير صحيح أو منتهي الصلاحية.");

        var isNew = false;
        var user = await userManager.Users.FirstOrDefaultAsync(u => u.PhoneNumber == phoneNumberE164 && u.DeletedAtUtc == null, ct);
        if (user is null)
        {
            isNew = true;
            user = new ApplicationUser
            {
                UserName = $"phone_{phoneNumberE164.TrimStart('+')}",
                PhoneNumber = phoneNumberE164,
                PhoneNumberConfirmed = true,
                DisplayName = "مستخدم سند",
                CreatedAtUtc = clock.UtcNow,
            };
            if (!string.IsNullOrWhiteSpace(email))
            {
                if (await userManager.FindByEmailAsync(email) is not null)
                    throw new RequestValidationException(new Dictionary<string, string[]> { ["email"] = ["هذا البريد مستخدم بالفعل في حساب آخر."] });
                user.Email = email;
            }
            var created = await userManager.CreateAsync(user);
            if (!created.Succeeded) throw ToValidation(created, "phoneNumber");
            await userManager.AddToRoleAsync(user, SanadRoles.Beneficiary);
        }
        else if (!string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(user.Email))
        {
            if (await userManager.FindByEmailAsync(email) is null)
            {
                user.Email = email;
                await userManager.UpdateAsync(user);
            }
        }
        return await ContinueSignInAsync(user, SanadClaims.MethodOtp, isNew, ct);
    }

    // ── المراحل الوسيطة ───────────────────────────────────────────────────────
    public async Task<AuthResult> ChangeRequiredPasswordAsync(string ticket, string newPassword, CancellationToken ct)
    {
        var (t, user) = await RequireTicketAsync(ticket, SignInTicketStage.PasswordChange, ct);
        var resetToken = await userManager.GeneratePasswordResetTokenAsync(user);
        var result = await userManager.ResetPasswordAsync(user, resetToken, newPassword);
        if (!result.Succeeded) throw ToValidation(result, "newPassword");
        user.MustChangePassword = false;
        await userManager.UpdateAsync(user);
        await tickets.RemoveAsync(ticket, ct);
        await audit.LogForActorAsync(user.Id, "Identity.RequiredPasswordChanged", "User", user.Id, ct: ct);
        return await ContinueSignInAsync(user, t.PrimaryAuthMethod, t.IsNewUser, ct);
    }

    public async Task<TwoFactorSetupInfo> BeginTwoFactorSetupAsync(string ticket, CancellationToken ct)
    {
        var (_, user) = await RequireTicketAsync(ticket, SignInTicketStage.MfaSetup, ct);
        await userManager.ResetAuthenticatorKeyAsync(user);
        var key = await userManager.GetAuthenticatorKeyAsync(user) ?? throw new InvalidOperationException("تعذّر توليد مفتاح المصادقة.");
        var label = UrlEncoder.Default.Encode($"{AuthenticatorIssuer}:{user.Email ?? user.PhoneNumber ?? user.Id.ToString()}");
        var uri = $"otpauth://totp/{label}?secret={key}&issuer={AuthenticatorIssuer}&digits=6";
        return new TwoFactorSetupInfo(key, uri);
    }

    public async Task<AuthResult> CompleteTwoFactorSetupAsync(string ticket, string code, CancellationToken ct)
    {
        var (t, user) = await RequireTicketAsync(ticket, SignInTicketStage.MfaSetup, ct);
        if (await userManager.GetAuthenticatorKeyAsync(user) is null) throw new AuthenticationFailedException("ابدأ إعداد التحقق الثنائي أولاً.");
        if (!await userManager.VerifyTwoFactorTokenAsync(user, TokenOptions.DefaultAuthenticatorProvider, code))
        {
            await RegisterTicketFailureAsync(ticket, t, ct);
            throw new AuthenticationFailedException("رمز التحقق الثنائي غير صحيح.");
        }
        user.AuthenticatorConfirmedAtUtc = clock.UtcNow;
        user.TwoFactorEnabled = true;
        await userManager.UpdateAsync(user);
        await tickets.RemoveAsync(ticket, ct);
        await audit.LogForActorAsync(user.Id, "Identity.TwoFactorEnabled", "User", user.Id, ct: ct);
        return await IssueAsync(user, SanadClaims.MethodMfa, t.IsNewUser, ct);
    }

    public async Task<AuthResult> VerifyTwoFactorAsync(string ticket, string code, CancellationToken ct)
    {
        var (t, user) = await RequireTicketAsync(ticket, SignInTicketStage.MfaCode, ct);
        if (!await userManager.VerifyTwoFactorTokenAsync(user, TokenOptions.DefaultAuthenticatorProvider, code))
        {
            await RegisterTicketFailureAsync(ticket, t, ct);
            throw new AuthenticationFailedException("رمز التحقق الثنائي غير صحيح.");
        }
        await tickets.RemoveAsync(ticket, ct);
        return await IssueAsync(user, SanadClaims.MethodMfa, t.IsNewUser, ct);
    }

    // ── الرموز ─────────────────────────────────────────────────────────────────
    public async Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var hash = JwtTokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct) ?? throw new AuthenticationFailedException("الجلسة غير صالحة.");
        var now = clock.UtcNow;
        if (stored.RevokedAtUtc is not null)
        {
            // إعادة استخدام رمز مُدوَّر = مؤشر سرقة ⇒ إبطال كل جلسات المستخدم
            await RevokeAllSessionsAsync(stored.UserId, ct);
            await audit.LogForActorAsync(stored.UserId, "Identity.RefreshTokenReuseDetected", "User", stored.UserId, ct: ct);
            throw new AuthenticationFailedException("الجلسة غير صالحة.");
        }
        if (stored.ExpiresAtUtc <= now) throw new AuthenticationFailedException("انتهت الجلسة — سجّل الدخول من جديد.");

        var user = await userManager.FindByIdAsync(stored.UserId.ToString());
        if (user is null || user.DeletedAtUtc is not null) throw new AuthenticationFailedException("الجلسة غير صالحة.");

        var result = await CreateTokensAsync(user, stored.AuthMethod, ct);
        stored.RevokedAtUtc = now;
        stored.ReplacedByTokenHash = JwtTokenService.Hash(result.RefreshToken);
        await db.SaveChangesAsync(ct);
        return result;
    }

    public async Task RevokeAsync(Guid userId, string? refreshToken, string? accessTokenJti, DateTimeOffset? accessTokenExpiresAtUtc, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var hash = JwtTokenService.Hash(refreshToken);
            var stored = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash && r.UserId == userId, ct);
            if (stored is not null && stored.RevokedAtUtc is null)
            {
                stored.RevokedAtUtc = clock.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }
        if (accessTokenJti is not null && accessTokenExpiresAtUtc is { } exp) await revocations.RevokeJtiAsync(accessTokenJti, exp, ct);
    }

    // ── المستخدمون والأدوار ────────────────────────────────────────────────────
    public async Task<UserSummary?> GetUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null) return null;
        var roles = await userManager.GetRolesAsync(user);
        return ToSummary(user, roles.ToList());
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(IEnumerable<Guid> userIds, CancellationToken ct)
    {
        var ids = userIds.Distinct().ToList();
        return await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
    }

    public async Task<IReadOnlyList<Guid>> GetUserIdsInRoleAsync(SanadRole role, CancellationToken ct) =>
        (await userManager.GetUsersInRoleAsync(role.ToString())).Where(u => u.DeletedAtUtc is null).Select(u => u.Id).ToList();

    public async Task<UserPage> SearchUsersAsync(string? search, int page, int pageSize, CancellationToken ct)
    {
        var query = db.Users.AsNoTracking().Where(u => u.DeletedAtUtc == null);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(u => (u.Email != null && u.Email.Contains(search)) || u.DisplayName.Contains(search) ||
                                     (u.PhoneNumber != null && u.PhoneNumber.Contains(search)));
        var total = await query.CountAsync(ct);
        var users = (await query.ToListAsync(ct)).OrderBy(u => u.DisplayName, StringComparer.Ordinal)
            .Skip((page - 1) * pageSize).Take(pageSize).ToList();
        var ids = users.Select(u => u.Id).ToList();
        var roleRows = await (from ur in db.UserRoles
                              join r in db.Roles on ur.RoleId equals r.Id
                              where ids.Contains(ur.UserId)
                              select new { ur.UserId, r.Name }).ToListAsync(ct);
        return new UserPage(users.Select(u => ToSummary(u, roleRows.Where(x => x.UserId == u.Id).Select(x => x.Name!).ToList())).ToList(), total);
    }

    public async Task UpdateDisplayNameAsync(Guid userId, string displayName, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("المستخدم", userId);
        user.DisplayName = displayName;
        await userManager.UpdateAsync(user);
    }

    public async Task UpdatePrivacyPreferencesAsync(Guid userId, bool hideIdentityUntilBookingConfirmed,
        int? quietHoursStartHourUtc, int? quietHoursEndHourUtc, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("المستخدم", userId);
        user.HideIdentityUntilBookingConfirmed = hideIdentityUntilBookingConfirmed;
        user.QuietHoursStartHourUtc = quietHoursStartHourUtc;
        user.QuietHoursEndHourUtc = quietHoursEndHourUtc;
        await userManager.UpdateAsync(user);
    }

    public async Task<IReadOnlyDictionary<Guid, bool>> GetHideIdentityPreferencesAsync(IEnumerable<Guid> userIds, CancellationToken ct)
    {
        var ids = userIds.Distinct().ToList();
        return await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.HideIdentityUntilBookingConfirmed, ct);
    }

    /// <summary>منح الأدوار — الآلية الرسمية الوحيدة. الأدوار الحساسة: 2FA إلزامي فوراً، وإبطال الجلسات القائمة.</summary>
    public async Task AssignRoleAsync(Guid userId, SanadRole role, Guid assignedByUserId, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.DeletedAtUtc is not null) throw new NotFoundException("المستخدم", userId);
        if (await userManager.IsInRoleAsync(user, role.ToString())) return;
        var result = await userManager.AddToRoleAsync(user, role.ToString());
        if (!result.Succeeded) throw ToValidation(result, "role");

        if (SanadRoles.Sensitive.Contains(role))
            await userManager.SetTwoFactorEnabledAsync(user, true); // لا عملية إدارية قبل إعداده فعلياً (جلسة amr=mfa)
        await RevokeAllSessionsAsync(user.Id, ct);
        await audit.LogAsync("Identity.RoleAssigned", "User", userId, new { Role = role.ToString(), AssignedBy = assignedByUserId }, ct: ct);
    }

    public async Task RemoveRoleAsync(Guid userId, SanadRole role, Guid removedByUserId, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("المستخدم", userId);
        if (!await userManager.IsInRoleAsync(user, role.ToString())) return;
        var result = await userManager.RemoveFromRoleAsync(user, role.ToString());
        if (!result.Succeeded) throw ToValidation(result, "role");
        await RevokeAllSessionsAsync(user.Id, ct);
        await audit.LogAsync("Identity.RoleRemoved", "User", userId, new { Role = role.ToString(), RemovedBy = removedByUserId }, ct: ct);
    }

    public async Task DeletePersonalDataAsync(Guid userId, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("المستخدم", userId);
        foreach (var login in await userManager.GetLoginsAsync(user))
            await userManager.RemoveLoginAsync(user, login.LoginProvider, login.ProviderKey);
        var roles = await userManager.GetRolesAsync(user);
        if (roles.Count > 0) await userManager.RemoveFromRolesAsync(user, roles);
        if (await userManager.HasPasswordAsync(user)) await userManager.RemovePasswordAsync(user);

        var phone = user.PhoneNumber;
        user.Email = null;
        user.NormalizedEmail = null;
        user.UserName = $"deleted_{user.Id:N}";
        user.PhoneNumber = null;
        user.DisplayName = "حساب محذوف";
        user.TwoFactorEnabled = false;
        user.AuthenticatorConfirmedAtUtc = null;
        user.LockoutEnabled = true;
        user.LockoutEnd = DateTimeOffset.MaxValue;
        user.DeletedAtUtc = clock.UtcNow;
        await userManager.UpdateAsync(user);
        await userManager.ResetAuthenticatorKeyAsync(user);

        if (phone is not null) db.OtpChallenges.RemoveRange(await db.OtpChallenges.Where(c => c.PhoneNumberE164 == phone).ToListAsync(ct));
        // لا يبقى ما يربط بالمستخدم: إشعاراته، والردود المحفوظة لمفاتيح التكرار (قد تحوي بياناته)
        db.UserNotifications.RemoveRange(await db.UserNotifications.Where(n => n.UserId == user.Id).ToListAsync(ct));
        db.IdempotencyRecords.RemoveRange(await db.IdempotencyRecords.Where(r => r.UserId == user.Id).ToListAsync(ct));
        db.PushDevices.RemoveRange(await db.PushDevices.Where(d => d.UserId == user.Id).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        await RevokeAllSessionsAsync(user.Id, ct);
        // بعد الإبطال (وما يتبعه من إبطال رموز الوصول) تُحذف صفوف الجلسات نفسها
        db.RefreshTokens.RemoveRange(await db.RefreshTokens.Where(t => t.UserId == user.Id).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        await audit.LogForActorAsync(Domain.Audit.AuditLogEntry.AnonymizedActorId, "Accounts.AccountDeleted", "User", null, ct: ct);
    }

    // ── داخلي ─────────────────────────────────────────────────────────────────
    /// <summary>بعد نجاح المصادقة الأولية: تغيير كلمة مرور مؤقتة؟ إعداد 2FA؟ إدخال رمز 2FA؟ ثم الرموز.</summary>
    private async Task<AuthResult> ContinueSignInAsync(ApplicationUser user, string authMethod, bool isNewUser, CancellationToken ct)
    {
        if (user.MustChangePassword && authMethod == SanadClaims.MethodPassword)
            return await TicketAsync(user, SignInTicketStage.PasswordChange, authMethod, isNewUser, SignInStage.RequiresPasswordChange, ct);

        var roles = await userManager.GetRolesAsync(user);
        var hasSensitiveRole = roles.Any(r => Enum.TryParse<SanadRole>(r, out var role) && SanadRoles.Sensitive.Contains(role));
        if (user.TwoFactorEnabled || hasSensitiveRole)
        {
            var key = await userManager.GetAuthenticatorKeyAsync(user);
            var configured = user.TwoFactorEnabled && !string.IsNullOrEmpty(key) && user.AuthenticatorConfirmedAtUtc is not null;
            return configured
                ? await TicketAsync(user, SignInTicketStage.MfaCode, authMethod, isNewUser, SignInStage.RequiresTwoFactorCode, ct)
                : await TicketAsync(user, SignInTicketStage.MfaSetup, authMethod, isNewUser, SignInStage.RequiresTwoFactorSetup, ct);
        }
        return await IssueAsync(user, authMethod, isNewUser, ct);
    }

    private async Task<AuthResult> TicketAsync(ApplicationUser user, SignInTicketStage stage, string method, bool isNewUser, SignInStage publicStage, CancellationToken ct)
    {
        var raw = await tickets.IssueAsync(new SignInTicket(user.Id, stage, method, isNewUser, 0), ct);
        return new AuthResult(user.Id, publicStage, null, raw, isNewUser);
    }

    private async Task<AuthResult> IssueAsync(ApplicationUser user, string authMethod, bool isNewUser, CancellationToken ct) =>
        new(user.Id, SignInStage.Succeeded, await CreateTokensAsync(user, authMethod, ct), null, isNewUser);

    private async Task<AuthTokens> CreateTokensAsync(ApplicationUser user, string authMethod, CancellationToken ct)
    {
        var roles = await userManager.GetRolesAsync(user);
        var (access, _, accessExp) = tokens.CreateAccessToken(user, roles, authMethod);
        var refresh = JwtTokenService.NewOpaqueToken();
        var now = clock.UtcNow;
        var refreshExp = now.AddDays(jwtOptions.Value.RefreshTokenDays);
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = JwtTokenService.Hash(refresh),
            AuthMethod = authMethod,
            CreatedAtUtc = now,
            ExpiresAtUtc = refreshExp,
        });
        await db.SaveChangesAsync(ct);
        return new AuthTokens(access, accessExp, refresh, refreshExp);
    }

    private async Task RevokeAllSessionsAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        foreach (var t in await db.RefreshTokens.Where(r => r.UserId == userId && r.RevokedAtUtc == null).ToListAsync(ct)) t.RevokedAtUtc = now;
        await db.SaveChangesAsync(ct);
        await revocations.RevokeAllIssuedBeforeNowAsync(userId, ct);
    }

    private async Task<(SignInTicket Ticket, ApplicationUser User)> RequireTicketAsync(string raw, SignInTicketStage stage, CancellationToken ct)
    {
        var t = await tickets.GetAsync(raw, ct);
        if (t is null || t.Stage != stage || t.FailedAttempts >= SignInTicketStore.MaxAttempts)
            throw new AuthenticationFailedException("انتهت صلاحية خطوة الدخول — ابدأ من جديد.");
        var user = await userManager.FindByIdAsync(t.UserId.ToString());
        if (user is null || user.DeletedAtUtc is not null) throw new AuthenticationFailedException();
        return (t, user);
    }

    private async Task RegisterTicketFailureAsync(string raw, SignInTicket t, CancellationToken ct)
    {
        var updated = t with { FailedAttempts = t.FailedAttempts + 1 };
        if (updated.FailedAttempts >= SignInTicketStore.MaxAttempts) await tickets.RemoveAsync(raw, ct);
        else await tickets.SaveAsync(raw, updated, ct);
    }

    private static UserSummary ToSummary(ApplicationUser u, IReadOnlyList<string> roles) =>
        new(u.Id, u.Email, u.PhoneNumber, u.DisplayName, roles, u.TwoFactorEnabled, u.CreatedAtUtc, u.DeletedAtUtc is not null,
            u.EmailConfirmed, u.HideIdentityUntilBookingConfirmed, u.QuietHoursStartHourUtc, u.QuietHoursEndHourUtc);

    private static RequestValidationException ToValidation(IdentityResult result, string field)
    {
        // رسالة عامة للتكرار حتى لا يُستخدم التسجيل لاستكشاف وجود الحسابات
        var messages = result.Errors.Select(e => e.Code is "DuplicateEmail" or "DuplicateUserName"
            ? "تعذّر إنشاء الحساب بهذه البيانات. إن كان لديك حساب، سجّل الدخول."
            : e.Code.StartsWith("Password", StringComparison.Ordinal) ? "كلمة المرور لا تستوفي متطلبات الأمان." : "بيانات غير صالحة.")
            .Distinct().ToArray();
        return new RequestValidationException(new Dictionary<string, string[]> { [field] = messages });
    }
}
