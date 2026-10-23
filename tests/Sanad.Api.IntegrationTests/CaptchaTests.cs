using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Common.Interfaces;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>CAPTCHA مفعّل كما في الإنتاج (بقية الاختبارات تعطّله)، بمحقق لا يقبل إلا الرمز "ok".</summary>
public sealed class CaptchaFixture : IDisposable
{
    private sealed class OnlyOk : ICaptchaVerifier
    {
        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct) => Task.FromResult(token == "ok");
    }

    public SanadApiFactory Factory { get; } = new(services => services.Replace(ServiceDescriptor.Singleton<ICaptchaVerifier, OnlyOk>()));
    public void Dispose() => Factory.Dispose();
}

/// <summary>
/// CAPTCHA يحمي ما يُنشئ حساباً أو يرسل رمزاً بلا دخول. أما ما يفعله مستخدم مسجَّل (البلاغ، طلب الترقية) فبحد لكل حساب:
/// تطبيق الجوال لا يعرض ودجت Turnstile، فكان كل بلاغ منه يُرفض في الإنتاج دون أن تكشفه الاختبارات.
/// </summary>
public sealed class CaptchaTests(CaptchaFixture fixture) : IClassFixture<CaptchaFixture>
{
    private readonly TestApi _api = new(fixture.Factory);

    private static object NewAccount() => new
    {
        email = $"{Guid.NewGuid():N}@sanad.test",
        password = "Strong-Pass-123",
        displayName = "مستفيد",
        acceptTerms = true,
        acceptPrivacyPolicy = true,
    };

    private async Task<Session> RegisterAsync()
    {
        using var register = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/register/email") { Content = Body(NewAccount()) };
        register.Headers.Add("X-Captcha-Token", "ok");
        return ToSession(await Ok(await _api.Client().SendAsync(register)));
    }

    [Fact]
    public async Task Email_registration_still_requires_a_valid_captcha()
    {
        var res = await _api.Client().PostAsync("/api/v1/auth/register/email", Body(NewAccount()));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(res))["code"]!.GetValue<string>().Should().Be("captcha_failed");
    }

    [Fact]
    public async Task A_signed_in_user_can_report_and_request_an_upgrade_without_a_captcha()
    {
        var session = await RegisterAsync();
        var target = await RegisterAsync();

        var report = await _api.Client(session, Guid.NewGuid().ToString()).PostAsync("/api/v1/reports", Body(new
        {
            targetType = "UserAccount",
            targetId = target.UserId,
            category = "Harassment",
            severity = "Medium",
            description = "رسائل مزعجة",
        }));
        report.StatusCode.Should().Be(HttpStatusCode.OK, await report.Content.ReadAsStringAsync());

        var upgrade = await _api.Client(session).PostAsync("/api/v1/me/provider-upgrade-request", Body(new
        {
            requestedType = "ReligiousPractitioner",
            declaredTitle = "راقٍ",
            documentType = "ShariaIjazah",
            issuingAuthority = "جهة",
            uploadedDocumentFileId = Guid.NewGuid(),
        }));
        // المستند وهمي فيُرفض الطلب لسبب آخر — المهم ألا يكون CAPTCHA
        var code = (await ReadJson(upgrade))["code"]?.GetValue<string>();
        code.Should().NotBe("captcha_failed");
    }
}
