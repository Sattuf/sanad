using System.Net;
using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Common.Interfaces;
using Sanad.Infrastructure.Identity;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>
/// مفاتيح مزودين مزيّفة: مفتاح RSA محلي يحل محل مفاتيح جوجل وأبل المنشورة، فنوقّع رموز هوية حقيقية البنية
/// ونمرّرها على نفس مسار التحقق الكامل (توقيع، مُصدِر، جمهور، صلاحية، nonce).
/// </summary>
public sealed class NativeSignInFixture : IDisposable
{
    public const string GoogleAudience = "sanad-web.apps.googleusercontent.com";
    public const string AppleAudience = "app.sanad";

    public NativeSignInFixture()
    {
        Factory = new SanadApiFactory(
            services =>
            {
                services.RemoveAll<IExternalSigningKeys>();
                services.AddSingleton<IExternalSigningKeys>(new FixedKeys(ProviderKey));
            },
            new Dictionary<string, string>
            {
                ["Auth:Google:NativeClientIds:0"] = GoogleAudience,
                ["Auth:Apple:ClientIds:0"] = AppleAudience,
                ["MobileApp:MinVersion:Ios"] = "1.2.0",
            });
        Api = new TestApi(Factory);
    }

    public RsaSecurityKey ProviderKey { get; } = new(RSA.Create(2048)) { KeyId = "provider-key-1" };
    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();

    private sealed class FixedKeys(SecurityKey key) : IExternalSigningKeys
    {
        public Task<IEnumerable<SecurityKey>> GetAsync(ExternalLoginProvider provider, bool forceRefresh, CancellationToken ct) =>
            Task.FromResult<IEnumerable<SecurityKey>>([key]);
    }
}

public sealed class NativeSignInTests(NativeSignInFixture fixture) : IClassFixture<NativeSignInFixture>
{
    private readonly TestApi _api = fixture.Api;

    private string Token(string issuer, string audience, Dictionary<string, object> claims, SecurityKey? key = null, DateTime? expires = null)
    {
        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            IssuedAt = now.AddMinutes(-1),
            NotBefore = now.AddMinutes(-1),
            Expires = expires ?? now.AddMinutes(30),
            Claims = claims,
            SigningCredentials = new SigningCredentials(key ?? fixture.ProviderKey, SecurityAlgorithms.RsaSha256),
        });
    }

    private string Google(string sub, string email, bool verified = true, string audience = NativeSignInFixture.GoogleAudience, SecurityKey? key = null,
        DateTime? expires = null) =>
        Token("https://accounts.google.com", audience, new() { ["sub"] = sub, ["email"] = email, ["email_verified"] = verified, ["name"] = "مستخدم جوجل" },
            key, expires);

    private static string Sha256Hex(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private string Apple(string sub, string? email, string nonce)
    {
        var claims = new Dictionary<string, object> { ["sub"] = sub, ["nonce"] = Sha256Hex(nonce) };
        if (email is not null)
        {
            claims["email"] = email;
            claims["email_verified"] = "true"; // أبل ترسلها نصاً
        }
        return Token("https://appleid.apple.com", NativeSignInFixture.AppleAudience, claims);
    }

    private Task<HttpResponseMessage> PostGoogle(string idToken) => _api.Client().PostAsync("/api/v1/auth/google/native", Body(new { idToken }));

    private Task<HttpResponseMessage> PostApple(string identityToken, string nonce, string? displayName = null) =>
        _api.Client().PostAsync("/api/v1/auth/apple", Body(new { identityToken, nonce, displayName }));

    private static string NewSub() => Guid.NewGuid().ToString("N");
    private static string NewEmail() => $"{Guid.NewGuid():N}@native.test";

    [Fact]
    public async Task Providers_report_native_methods_when_configured()
    {
        var providers = await Ok(await _api.Client().GetAsync("/api/v1/auth/providers"));
        providers["googleNative"]!.GetValue<bool>().Should().BeTrue();
        providers["apple"]!.GetValue<bool>().Should().BeTrue();
        providers["google"]!.GetValue<bool>().Should().BeFalse("مسار الويب يحتاج ClientId وClientSecret مستقلين");
    }

    [Fact]
    public async Task Google_native_creates_a_beneficiary_then_signs_the_same_account_in_again()
    {
        var sub = NewSub();
        var email = NewEmail();
        var first = await Ok(await PostGoogle(Google(sub, email)));
        first["isNewUser"]!.GetValue<bool>().Should().BeTrue();
        var session = ToSession(first);

        var me = await Ok(await _api.Client(session).GetAsync("/api/v1/me"));
        me["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Equal("Beneficiary");

        var again = await Ok(await PostGoogle(Google(sub, email)));
        again["isNewUser"]!.GetValue<bool>().Should().BeFalse();
        again["userId"]!.GetValue<string>().Should().Be(session.UserId.ToString());
    }

    [Fact]
    public async Task Google_native_links_to_an_existing_account_with_the_same_verified_email()
    {
        var email = NewEmail();
        var registered = await _api.RegisterBeneficiaryAsync(email);
        var res = await Ok(await PostGoogle(Google(NewSub(), email)));
        res["userId"]!.GetValue<string>().Should().Be(registered.UserId.ToString());
        res["isNewUser"]!.GetValue<bool>().Should().BeFalse();
    }

    [Fact]
    public async Task Google_native_rejects_foreign_audience_expired_unverified_and_forged_tokens()
    {
        var forger = new RsaSecurityKey(RSA.Create(2048)) { KeyId = "provider-key-1" };
        var rejected = new[]
        {
            Google(NewSub(), NewEmail(), audience: "someone-elses-app.apps.googleusercontent.com"),
            Google(NewSub(), NewEmail(), expires: DateTime.UtcNow.AddMinutes(-10)),
            Google(NewSub(), NewEmail(), verified: false),
            Google(NewSub(), NewEmail(), key: forger),
            "not-a-jwt",
        };
        foreach (var token in rejected)
        {
            var res = await PostGoogle(token);
            res.StatusCode.Should().Be(HttpStatusCode.Unauthorized, token[..Math.Min(20, token.Length)]);
            (await ReadJson(res))["code"]!.GetValue<string>().Should().Be("external_token_invalid");
        }
    }

    [Fact]
    public async Task Apple_creates_account_with_app_supplied_name_and_signs_in_later_without_email()
    {
        var sub = NewSub();
        var first = await Ok(await PostApple(Apple(sub, NewEmail(), "nonce-1"), "nonce-1", "عبدالله"));
        first["isNewUser"]!.GetValue<bool>().Should().BeTrue();
        var session = ToSession(first);
        (await Ok(await _api.Client(session).GetAsync("/api/v1/me")))["displayName"]!.GetValue<string>().Should().Be("عبدالله");

        // أبل لا ترسل البريد غالباً بعد أول دخول — المعرّف المربوط يكفي
        var again = await Ok(await PostApple(Apple(sub, null, "nonce-2"), "nonce-2"));
        again["userId"]!.GetValue<string>().Should().Be(session.UserId.ToString());
    }

    [Fact]
    public async Task Apple_rejects_a_token_replayed_with_a_different_nonce()
    {
        var token = Apple(NewSub(), NewEmail(), "original-nonce");
        (await PostApple(token, "attacker-nonce")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await PostApple(token, "")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Apple_first_sign_in_without_email_is_refused()
    {
        var res = await PostApple(Apple(NewSub(), null, "n"), "n");
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_google_token_is_not_accepted_as_an_apple_token()
    {
        var googleToken = Google(NewSub(), NewEmail());
        (await PostApple(googleToken, "n")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Min_version_is_public_and_configurable()
    {
        var v = await Ok(await _api.Client().GetAsync("/api/v1/public/app/min-version"));
        v["ios"]!.GetValue<string>().Should().Be("1.2.0");
        v["android"]!.GetValue<string>().Should().Be("0.0.0");
    }
}

public sealed class NativeSignInDisabledTests : IDisposable
{
    private readonly SanadApiFactory _factory = new();

    [Fact]
    public async Task Native_endpoints_do_not_exist_until_configured()
    {
        var client = new TestApi(_factory).Client();
        (await client.PostAsync("/api/v1/auth/google/native", Body(new { idToken = "x" }))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await client.PostAsync("/api/v1/auth/apple", Body(new { identityToken = "x", nonce = "n" }))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    public void Dispose() => _factory.Dispose();
}
