using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Identity;

/// <summary>هوية موثّقة من رمز مزود خارجي. البريد null إن لم يرسله المزود أو لم يكن موثّقاً.</summary>
public sealed record ExternalIdentity(string Subject, string? VerifiedEmail, string? DisplayName);

/// <summary>
/// التحقق من رموز الهوية (ID Token) التي يحصل عليها تطبيق الجوال من جوجل وأبل مباشرة (ADR-0019):
/// التوقيع بمفاتيح المزود المنشورة، والمُصدِر، والجمهور (معرّفات تطبيقاتنا فقط)، والصلاحية — وnonce لأبل.
/// أي فشل يعيد null؛ لا تفاصيل للمهاجم.
/// </summary>
public interface IExternalIdTokenValidator
{
    bool IsEnabled(ExternalLoginProvider provider);
    Task<ExternalIdentity?> ValidateGoogleAsync(string idToken, CancellationToken ct);

    /// <param name="rawNonce">القيمة الأصلية التي ولّدها التطبيق؛ رمز أبل يحمل SHA-256 لها (hex) كما مرّرها التطبيق لأبل.</param>
    Task<ExternalIdentity?> ValidateAppleAsync(string identityToken, string rawNonce, CancellationToken ct);
}

/// <summary>مصدر مفاتيح التوقيع لكل مزود — قابل للاستبدال في الاختبارات.</summary>
public interface IExternalSigningKeys
{
    Task<IEnumerable<SecurityKey>> GetAsync(ExternalLoginProvider provider, bool forceRefresh, CancellationToken ct);
}

/// <summary>مفاتيح JWKS من وثيقة OpenID Connect لكل مزود، مخزّنة مؤقتاً ومحدَّثة دورياً (ConfigurationManager).</summary>
public sealed class OidcSigningKeys : IExternalSigningKeys
{
    private readonly Dictionary<ExternalLoginProvider, ConfigurationManager<OpenIdConnectConfiguration>> _managers = new()
    {
        [ExternalLoginProvider.Google] = Manager("https://accounts.google.com/.well-known/openid-configuration"),
        [ExternalLoginProvider.Apple] = Manager("https://appleid.apple.com/.well-known/openid-configuration"),
    };

    private static ConfigurationManager<OpenIdConnectConfiguration> Manager(string url) =>
        new(url, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever { RequireHttps = true });

    public async Task<IEnumerable<SecurityKey>> GetAsync(ExternalLoginProvider provider, bool forceRefresh, CancellationToken ct)
    {
        var manager = _managers[provider];
        if (forceRefresh) manager.RequestRefresh();
        return (await manager.GetConfigurationAsync(ct)).SigningKeys;
    }
}

public sealed class ExternalIdTokenValidator(IConfiguration config, IExternalSigningKeys keys, ILogger<ExternalIdTokenValidator> logger)
    : IExternalIdTokenValidator
{
    private static readonly string[] GoogleIssuers = ["https://accounts.google.com", "accounts.google.com"];
    private const string AppleIssuer = "https://appleid.apple.com";
    private readonly JsonWebTokenHandler _handler = new();

    /// <summary>جمهور جوجل: معرّف عميل الويب (الذي يُمرَّر webClientId في التطبيق) + أي معرّفات أصلية إضافية.</summary>
    private string[] GoogleAudiences =>
        [.. new[] { config["Auth:Google:ClientId"] }.Concat(config.GetSection("Auth:Google:NativeClientIds").Get<string[]>() ?? [])
            .Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a!)];

    /// <summary>جمهور أبل: معرّف حزمة تطبيق iOS (مثل app.sanad).</summary>
    private string[] AppleAudiences =>
        [.. (config.GetSection("Auth:Apple:ClientIds").Get<string[]>() ?? []).Where(a => !string.IsNullOrWhiteSpace(a))];

    public bool IsEnabled(ExternalLoginProvider provider) => provider switch
    {
        ExternalLoginProvider.Google => GoogleAudiences.Length > 0,
        ExternalLoginProvider.Apple => AppleAudiences.Length > 0,
        _ => false,
    };

    public async Task<ExternalIdentity?> ValidateGoogleAsync(string idToken, CancellationToken ct)
    {
        var token = await ValidateAsync(ExternalLoginProvider.Google, idToken, GoogleIssuers, GoogleAudiences, ct);
        if (token is null) return null;
        var email = token.TryGetPayloadValue("email", out string? e) ? e : null;
        // جوجل لا تقبل بريداً غير موثّق — نفس شرط مسار الويب
        if (string.IsNullOrWhiteSpace(email) || !IsTrue(token, "email_verified")) return null;
        return new ExternalIdentity(token.Subject, email, token.TryGetPayloadValue("name", out string? n) ? n : null);
    }

    public async Task<ExternalIdentity?> ValidateAppleAsync(string identityToken, string rawNonce, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawNonce) || rawNonce.Length > 200) return null;
        var token = await ValidateAsync(ExternalLoginProvider.Apple, identityToken, [AppleIssuer], AppleAudiences, ct);
        if (token is null) return null;

        // منع إعادة استخدام رمز مسروق: nonce في الرمز = SHA-256(rawNonce) الذي ولّده التطبيق لهذه المحاولة فقط
        var expected = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawNonce)));
        if (!token.TryGetPayloadValue("nonce", out string? nonce) || nonce is null ||
            !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(nonce), Encoding.UTF8.GetBytes(expected)))
        {
            logger.LogWarning("Apple identity token rejected: nonce mismatch");
            return null;
        }

        var email = token.TryGetPayloadValue("email", out string? e) && IsTrue(token, "email_verified") ? e : null;
        return new ExternalIdentity(token.Subject, string.IsNullOrWhiteSpace(email) ? null : email, null);
    }

    private async Task<JsonWebToken?> ValidateAsync(ExternalLoginProvider provider, string raw, string[] issuers, string[] audiences, CancellationToken ct)
    {
        if (audiences.Length == 0 || string.IsNullOrWhiteSpace(raw) || raw.Length > 8192) return null;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var parameters = new TokenValidationParameters
            {
                ValidIssuers = issuers,
                ValidAudiences = audiences,
                IssuerSigningKeys = await keys.GetAsync(provider, forceRefresh: attempt > 0, ct),
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                RequireSignedTokens = true,
                ValidateIssuerSigningKey = true,
                ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                ClockSkew = TimeSpan.FromMinutes(2),
            };
            var result = await _handler.ValidateTokenAsync(raw, parameters);
            if (result.IsValid) return (JsonWebToken)result.SecurityToken;
            // المزود دوّر مفاتيحه — أعد الجلب مرة واحدة فقط
            if (attempt == 0 && result.Exception is SecurityTokenSignatureKeyNotFoundException) continue;
            logger.LogWarning("{Provider} identity token rejected: {Reason}", provider, result.Exception?.GetType().Name);
            return null;
        }
        return null;
    }

    /// <summary>جوجل ترسل email_verified كقيمة منطقية، وأبل أحياناً كنص "true".</summary>
    private static bool IsTrue(JsonWebToken token, string claim) =>
        (token.TryGetPayloadValue(claim, out bool b) && b) ||
        (token.TryGetPayloadValue(claim, out string? s) && string.Equals(s, "true", StringComparison.OrdinalIgnoreCase));
}
