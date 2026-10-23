using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Sanad.Api.IntegrationTests.Infrastructure;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests.Security;

/// <summary>
/// تحصين الـ API: رموز JWT مزوّرة أو منتهية أو مُبطلة، إعادة استعمال رمز التحديث، SignalR، ترويسات الأمان وCORS،
/// فحص الملفات المرفوعة، حقن SQL، وأن أخطاء الخادم لا تكشف تفاصيل داخلية.
/// </summary>
public sealed partial class ApiHardeningTests(MatrixFixture fx) : IClassFixture<MatrixFixture>
{
    private string Config(string key) => fx.Factory.Services.GetRequiredService<IConfiguration>()[key]!;

    private string Issuer => Config("Auth:Jwt:Issuer") ?? "sanad";
    private string Audience => Config("Auth:Jwt:Audience") ?? "sanad-clients";

    /// <summary>رمز بمطالبات رمز حقيقي، يُوقَّع بالمفتاح المعطى ويُعدَّل حسب الحاجة.</summary>
    private static string Sign(IDictionary<string, object> claims, byte[] key, string issuer, string audience, DateTime expires)
    {
        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Claims = claims,
            Issuer = issuer,
            Audience = audience,
            IssuedAt = expires.AddMinutes(-20),
            NotBefore = expires.AddMinutes(-20),
            Expires = expires,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256),
        });
    }

    private static Dictionary<string, object> ClaimsOf(string jwt)
    {
        var token = new JsonWebToken(jwt);
        return token.Claims.Where(c => c.Type is not ("iss" or "aud" or "exp" or "nbf" or "iat"))
            .GroupBy(c => c.Type).ToDictionary(g => g.Key, g => g.Count() == 1 ? (object)g.First().Value : g.Select(c => c.Value).ToArray());
    }

    private static string B64Url(string json) => Base64UrlEncoder.Encode(Encoding.UTF8.GetBytes(json));

    private async Task<HttpStatusCode> Me(string token)
    {
        var client = fx.Api.Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (await client.GetAsync("/api/v1/me")).StatusCode;
    }

    // ── JWT ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Forged_expired_and_tampered_access_tokens_are_rejected()
    {
        var session = await fx.Api.RegisterBeneficiaryAsync();
        (await Me(session.AccessToken)).Should().Be(HttpStatusCode.OK);

        var key = Convert.FromBase64String(Config("Auth:Jwt:SigningKeyBase64"));
        var claims = ClaimsOf(session.AccessToken);
        var future = DateTime.UtcNow.AddMinutes(10);

        // ضابط: نفس المطالبات بالمفتاح الصحيح تُقبل — فأي رفض أدناه سببه التعديل وحده
        (await Me(Sign(claims, key, Issuer, Audience, future))).Should().Be(HttpStatusCode.OK);

        var parts = session.AccessToken.Split('.');
        var unsigned = $"{B64Url("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{parts[1]}.";
        (await Me(unsigned)).Should().Be(HttpStatusCode.Unauthorized, "alg=none");

        (await Me(Sign(claims, Encoding.UTF8.GetBytes(new string('k', 64)), Issuer, Audience, future))).Should().Be(HttpStatusCode.Unauthorized, "another key");
        (await Me(Sign(claims, key, "evil-issuer", Audience, future))).Should().Be(HttpStatusCode.Unauthorized, "wrong issuer");
        (await Me(Sign(claims, key, Issuer, "evil-audience", future))).Should().Be(HttpStatusCode.Unauthorized, "wrong audience");
        (await Me(Sign(claims, key, Issuer, Audience, DateTime.UtcNow.AddMinutes(-5)))).Should().Be(HttpStatusCode.Unauthorized, "expired beyond the skew");

        // ترقية الدور في الحمولة مع إبقاء التوقيع الأصلي
        var payload = JsonNode.Parse(Base64UrlEncoder.Decode(parts[1]))!.AsObject();
        payload["role"] = new JsonArray("SystemAdmin");
        (await Me($"{parts[0]}.{B64Url(payload.ToJsonString())}.{parts[2]}")).Should().Be(HttpStatusCode.Unauthorized, "tampered payload");
    }

    [Fact]
    public async Task Revoked_access_token_is_rejected_and_a_reused_refresh_token_ends_every_session()
    {
        var first = await fx.Api.RegisterBeneficiaryAsync();
        var client = fx.Api.Client();

        // التدوير: رمز تحديث جديد، والقديم صار مستعملاً
        var rotated = await Ok(await client.PostAsync("/api/v1/auth/refresh", Body(new { refreshToken = first.RefreshToken })));
        var access2 = rotated["accessToken"]!.GetValue<string>();
        var refresh2 = rotated["refreshToken"]!.GetValue<string>();
        (await Me(access2)).Should().Be(HttpStatusCode.OK);

        // إعادة استعمال القديم = مؤشر سرقة: يُرفض، وتُبطَل كل الجلسات ومنها الجديدة
        (await client.PostAsync("/api/v1/auth/refresh", Body(new { refreshToken = first.RefreshToken }))).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized);
        (await Me(access2)).Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsync("/api/v1/auth/refresh", Body(new { refreshToken = refresh2 }))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // الخروج يبطل رمز الوصول فوراً (jti) لا عند انتهائه
        var other = await fx.Api.RegisterBeneficiaryAsync();
        (await fx.Api.Client(other).PostAsync("/api/v1/auth/revoke", Body(new { refreshToken = other.RefreshToken }))).StatusCode
            .Should().Be(HttpStatusCode.NoContent);
        (await Me(other.AccessToken)).Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsync("/api/v1/auth/refresh", Body(new { refreshToken = other.RefreshToken }))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── SignalR ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Chat_hub_needs_a_token_and_the_query_string_token_works_only_for_hubs()
    {
        var session = await fx.Api.RegisterBeneficiaryAsync();
        var anon = fx.Api.Client();
        (await anon.PostAsync("/hubs/chat/negotiate?negotiateVersion=1", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anon.PostAsync($"/hubs/chat/negotiate?negotiateVersion=1&access_token={session.AccessToken}", null)).StatusCode
            .Should().Be(HttpStatusCode.OK);

        // رمز في الرابط يتسرب في السجلات والسجل؛ مقبول للـ WebSocket فقط، لا لبقية الـ API
        (await anon.GetAsync($"/api/v1/me?access_token={session.AccessToken}")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── الترويسات وCORS ─────────────────────────────────────────────────

    [Theory]
    [InlineData("/api/v1/directory")]
    [InlineData("/api/v1/me")]
    [InlineData("/api/v1/no-such-route")]
    // خطأ يمر بمعالج الاستثناءات (404 من الطلب نفسه): المعالج يمسح الاستجابة، ويجب ألا تضيع الرؤوس معها
    [InlineData("/api/v1/providers/00000000-0000-0000-0000-000000000001")]
    public async Task Every_api_response_carries_the_security_headers(string path)
    {
        var res = await fx.Api.Client().GetAsync(path);
        string Header(string name) => res.Headers.TryGetValues(name, out var v) ? string.Join(",", v)
            : res.Content.Headers.TryGetValues(name, out var c) ? string.Join(",", c) : "";

        Header("Content-Security-Policy").Should().Contain("default-src 'none'").And.Contain("frame-ancestors 'none'");
        Header("X-Content-Type-Options").Should().Be("nosniff");
        Header("X-Frame-Options").Should().Be("DENY");
        Header("Referrer-Policy").Should().Be("strict-origin-when-cross-origin");
        Header("Cache-Control").Should().Contain("no-store");
        Header("Cross-Origin-Resource-Policy").Should().Be("same-origin");
        Header("X-Correlation-Id").Should().NotBeEmpty();
    }

    [Fact]
    public async Task An_error_response_returns_the_callers_correlation_id()
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/providers/00000000-0000-0000-0000-000000000001");
        req.Headers.Add("X-Correlation-Id", "support-ticket-42");
        var res = await fx.Api.Client().SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
        res.Headers.GetValues("X-Correlation-Id").Should().Equal("support-ticket-42");
        (await res.Content.ReadAsStringAsync()).Should().Contain("\"traceId\":\"support-ticket-42\"");
    }

    [Theory]
    [InlineData("/api/v1/media/tracks/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/public/recitation/x/1/1")]
    [InlineData("/api/v1/files/signed?key=x&exp=0&sig=x")]
    public async Task Audio_the_web_app_plays_may_be_loaded_cross_origin(string path)
    {
        var res = await fx.Api.Client().GetAsync(path);
        res.Headers.GetValues("Cross-Origin-Resource-Policy").Should().Equal("cross-origin");
    }

    [Fact]
    public async Task Cors_allows_only_the_configured_web_origin()
    {
        async Task<string?> Preflight(string origin)
        {
            using var req = new HttpRequestMessage(HttpMethod.Options, "/api/v1/me");
            req.Headers.Add("Origin", origin);
            req.Headers.Add("Access-Control-Request-Method", "GET");
            req.Headers.Add("Access-Control-Request-Headers", "authorization");
            var res = await fx.Api.Client().SendAsync(req);
            return res.Headers.TryGetValues("Access-Control-Allow-Origin", out var v) ? v.Single() : null;
        }

        var allowed = fx.Factory.Services.GetRequiredService<IConfiguration>().GetSection("Frontend:AllowedOrigins").Get<string[]>()?.FirstOrDefault()
                      ?? "http://localhost:5173";
        (await Preflight(allowed)).Should().Be(allowed);
        (await Preflight("https://evil.example")).Should().BeNull();
        (await Preflight("null")).Should().BeNull();
    }

    // ── الملفات المرفوعة ────────────────────────────────────────────────

    private static MultipartFormDataContent File(byte[] bytes, string name, string contentType)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(content, "file", name);
        return form;
    }

    [Theory]
    [InlineData("<html><script>alert(1)</script></html>", "doc.pdf", "application/pdf")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"/>", "doc.png", "image/png")]
    [InlineData("MZ\u0090\0\u0003\0\0\0", "doc.jpg", "image/jpeg")]
    public async Task Verification_documents_are_judged_by_their_bytes_not_their_name(string body, string name, string type)
    {
        var client = fx.Api.Client(await fx.Api.RegisterBeneficiaryAsync());
        var res = await client.PostAsync("/api/v1/me/documents", File(Encoding.UTF8.GetBytes(body), name, type));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_real_pdf_is_accepted_and_an_oversized_one_is_refused()
    {
        var client = fx.Api.Client(await fx.Api.RegisterBeneficiaryAsync());
        var pdf = Encoding.ASCII.GetBytes("%PDF-1.7\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
        (await client.PostAsync("/api/v1/me/documents", File(pdf, "doc.pdf", "application/pdf"))).StatusCode.Should().Be(HttpStatusCode.OK);

        var big = new byte[13 * 1024 * 1024];
        "%PDF-1.7\n"u8.CopyTo(big);
        var res = await client.PostAsync("/api/v1/me/documents", File(big, "big.pdf", "application/pdf"));
        res.IsSuccessStatusCode.Should().BeFalse();
        ((int)res.StatusCode).Should().BeOneOf(400, 413);
    }

    // ── حقن SQL ─────────────────────────────────────────────────────────

    [GeneratedRegex(@"\b(FromSqlRaw|ExecuteSqlRaw|FromSqlInterpolated|ExecuteSqlInterpolated|SqlQueryRaw|ExecuteSql|SqlQuery)\b|\.CommandText\b")]
    private static partial Regex RawSql();

    [Fact]
    public void Production_code_builds_no_raw_sql()
    {
        // كل استعلام عبر EF LINQ (قيم مُمرَّرة كمعاملات). أي SQL نصّي جديد يحتاج مراجعة صريحة وتحديث هذا الاختبار.
        var src = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src"));
        Directory.Exists(src).Should().BeTrue(src);
        var offenders = Directory.EnumerateFiles(src, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}Migrations{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                        && !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Where(f => RawSql().IsMatch(System.IO.File.ReadAllText(f)))
            .ToList();
        offenders.Should().BeEmpty();
    }

    [Theory]
    [InlineData("' OR '1'='1")]
    [InlineData("'; DROP TABLE \"AspNetUsers\"; --")]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("\\")]
    public async Task Search_and_filters_treat_injection_payloads_as_plain_text(string payload)
    {
        await fx.Api.PublishedPractitionerAsync();
        var all = (await Ok(await fx.Api.Client().GetAsync("/api/v1/directory")))["total"]!.GetValue<int>();
        all.Should().BeGreaterThan(0, "control: there are rows a leaked wildcard or OR 1=1 would return");

        var body = await Ok(await fx.Api.Client().GetAsync($"/api/v1/directory?q={Uri.EscapeDataString(payload)}&city={Uri.EscapeDataString(payload)}"));
        body["total"]!.GetValue<int>().Should().Be(0, "an injection or wildcard must not match every row");
        (await Ok(await fx.Api.Client().GetAsync("/api/v1/directory")))["total"]!.GetValue<int>().Should().Be(all, "the tables are intact");
    }

    // ── لا تفاصيل داخلية في الأخطاء ─────────────────────────────────────

    [Fact]
    public async Task Errors_never_reveal_stack_traces_or_internal_types()
    {
        var client = fx.Api.Client(await fx.Api.RegisterBeneficiaryAsync());
        var responses = new[]
        {
            await client.PostAsync("/api/v1/bookings", new StringContent("{not json", Encoding.UTF8, "application/json")),
            await client.PostAsync("/api/v1/bookings", Body(new { serviceOfferingId = "not-a-guid" })),
            await client.GetAsync($"/api/v1/bookings/{Guid.NewGuid()}"),
            await client.PutAsync($"/api/v1/me/companion/enrollment/{Guid.NewGuid()}/progress", new StringContent("[1,2,3]", Encoding.UTF8, "application/json")),
        };
        foreach (var res in responses)
        {
            var body = await res.Content.ReadAsStringAsync();
            res.IsSuccessStatusCode.Should().BeFalse(body);
            ((int)res.StatusCode).Should().BeLessThan(500, body);
            body.Should().NotMatchRegex(@"(?i)\bat Sanad\.|Exception\b|System\.|Microsoft\.EntityFrameworkCore|StackTrace|Npgsql|SQLite");
        }
    }
}
