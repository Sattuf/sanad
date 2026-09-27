using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Identity;

public sealed class JwtOptions
{
    public const string Section = "Auth:Jwt";

    public string Issuer { get; set; } = "sanad";
    public string Audience { get; set; } = "sanad-clients";

    /// <summary>مفتاح التوقيع (Base64، 32 بايت على الأقل) — منفصل تماماً عن مفتاح تشفير الحقول.</summary>
    public string SigningKeyBase64 { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 14;

    public SymmetricSecurityKey GetSigningKey()
    {
        if (string.IsNullOrWhiteSpace(SigningKeyBase64)) throw new InvalidOperationException("مفتاح توقيع JWT غير مُعدّ (Auth:Jwt:SigningKeyBase64).");
        var bytes = Convert.FromBase64String(SigningKeyBase64);
        if (bytes.Length < 32) throw new InvalidOperationException("مفتاح توقيع JWT يجب ألا يقل عن 32 بايت.");
        return new SymmetricSecurityKey(bytes);
    }
}

public static class SanadClaims
{
    public const string AuthMethod = "amr";
    public const string DisplayName = "name";
    public const string Role = "role";

    /// <summary>لحظة الإصدار بالميلي ثانية — دقة iat (ثانية) لا تكفي للتمييز بين رمز قبل إبطال شامل وبعده مباشرة.</summary>
    public const string IssuedAtMs = "iat_ms";

    public const string MethodPassword = "pwd";
    public const string MethodOtp = "otp";
    public const string MethodGoogle = "google";
    public const string MethodMfa = "mfa";
}

public sealed class JwtTokenService(IOptions<JwtOptions> options, IDateTime clock)
{
    private readonly JwtOptions _options = options.Value;

    public (string Token, string Jti, DateTimeOffset ExpiresAt) CreateAccessToken(ApplicationUser user, IEnumerable<string> roles, string authMethod)
    {
        var now = clock.UtcNow;
        var expires = now.AddMinutes(_options.AccessTokenMinutes);
        var jti = Guid.NewGuid().ToString("N");
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, jti),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64),
            new(SanadClaims.IssuedAtMs, now.ToUnixTimeMilliseconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64),
            new(SanadClaims.AuthMethod, authMethod),
            new(SanadClaims.DisplayName, user.DisplayName),
        };
        claims.AddRange(roles.Select(r => new Claim(SanadClaims.Role, r)));

        var token = new JwtSecurityToken(_options.Issuer, _options.Audience, claims, now.UtcDateTime, expires.UtcDateTime,
            new SigningCredentials(_options.GetSigningKey(), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), jti, expires);
    }

    public static string NewOpaqueToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(48));

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}

/// <summary>
/// قائمة إبطال الرموز (Redis في الإنتاج): jti مُبطَل، أو "كل الرموز الصادرة قبل لحظة X لهذا المستخدم"
/// (عند تغيير الأدوار أو حذف الحساب أو كشف إعادة استخدام رمز تحديث).
/// </summary>
public sealed class TokenRevocationStore(IDistributedCache cache, IOptions<JwtOptions> options, IDateTime clock)
{
    public Task RevokeJtiAsync(string jti, DateTimeOffset expiresAtUtc, CancellationToken ct)
    {
        var ttl = expiresAtUtc - clock.UtcNow;
        if (ttl <= TimeSpan.Zero) return Task.CompletedTask;
        return cache.SetStringAsync($"sanad:revoked-jti:{jti}", "1", new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl }, ct);
    }

    public Task RevokeAllIssuedBeforeNowAsync(Guid userId, CancellationToken ct) =>
        cache.SetStringAsync($"sanad:revoked-before:{userId}", clock.UtcNow.ToUnixTimeMilliseconds().ToString(System.Globalization.CultureInfo.InvariantCulture),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(options.Value.AccessTokenMinutes + 5) }, ct);

    public async Task<bool> IsRevokedAsync(string? jti, Guid userId, long issuedAtUnixMs, CancellationToken ct)
    {
        if (jti is not null && await cache.GetStringAsync($"sanad:revoked-jti:{jti}", ct) is not null) return true;
        var before = await cache.GetStringAsync($"sanad:revoked-before:{userId}", ct);
        return before is not null && long.TryParse(before, out var cutoffMs) && issuedAtUnixMs <= cutoffMs;
    }
}

public enum SignInTicketStage { PasswordChange, MfaSetup, MfaCode }

public sealed record SignInTicket(Guid UserId, SignInTicketStage Stage, string PrimaryAuthMethod, bool IsNewUser, int FailedAttempts);

/// <summary>تذاكر مراحل الدخول الوسيطة — معتمة، قصيرة الأجل (10 دقائق)، مخزَّنة كبصمة فقط، و5 محاولات كحد أقصى.</summary>
public sealed class SignInTicketStore(IDistributedCache cache)
{
    public const int MaxAttempts = 5;
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(10);

    public async Task<string> IssueAsync(SignInTicket ticket, CancellationToken ct)
    {
        var raw = JwtTokenService.NewOpaqueToken();
        await SaveAsync(raw, ticket, ct);
        return raw;
    }

    public async Task<SignInTicket?> GetAsync(string raw, CancellationToken ct)
    {
        var json = await cache.GetStringAsync(Key(raw), ct);
        return json is null ? null : JsonSerializer.Deserialize<SignInTicket>(json);
    }

    public Task SaveAsync(string raw, SignInTicket ticket, CancellationToken ct) =>
        cache.SetStringAsync(Key(raw), JsonSerializer.Serialize(ticket), new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = Ttl }, ct);

    public Task RemoveAsync(string raw, CancellationToken ct) => cache.RemoveAsync(Key(raw), ct);

    private static string Key(string raw) => $"sanad:signin-ticket:{JwtTokenService.Hash(raw)}";
}
