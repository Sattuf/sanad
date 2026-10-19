using System.Net;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Api.IntegrationTests.Infrastructure;
using Xunit.Abstractions;

namespace Sanad.Api.IntegrationTests.Security;

/// <summary>مضيف مستقل: المصفوفة تستدعي كل نقطة بأجسام فارغة، فلا تشارك قاعدة بقية الاختبارات.</summary>
public sealed class MatrixFixture : IDisposable
{
    public MatrixFixture()
    {
        Factory = new SanadApiFactory();
        Api = new TestApi(Factory);
    }

    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();
}

/// <summary>
/// مصفوفة الصلاحيات: تكتشف كل نقطة نهاية من التطبيق الحقيقي، وتستدعيها بأربع هويات
/// (مجهول، مستفيد لا يملك شيئاً، منسق بـ 2FA، مدير النظام) بمعرّفات عشوائية وجسم فارغ،
/// ثم تقارن النتيجة بالجدول المعتمد Security/authz-matrix.txt.
/// أي نقطة جديدة أو تغيّر في صلاحية يُسقط الاختبار حتى يُراجَع الجدول ويُعتمد (SANAD_UPDATE_AUTHZ_MATRIX=1).
/// </summary>
public sealed class AuthorizationMatrixTests(MatrixFixture fx, ITestOutputHelper output) : IClassFixture<MatrixFixture>
{
    private static readonly string BaselinePath =
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Security", "authz-matrix.txt");

    private static readonly HashSet<string> SessionEnding = ["/api/v1/auth/revoke"];

    private sealed record Probe(string Method, string Template, string Url, bool AllowAnonymous);

    private IReadOnlyList<Probe> Endpoints()
    {
        var source = fx.Factory.Services.GetRequiredService<EndpointDataSource>();
        var probes = new List<Probe>();
        foreach (var e in source.Endpoints.OfType<RouteEndpoint>())
        {
            var template = "/" + (e.RoutePattern.RawText ?? "").TrimStart('/');
            if (template.StartsWith("/hubs/", StringComparison.Ordinal)) continue; // SignalR: اختبار مستقل
            var methods = e.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? [];
            var anonymous = e.Metadata.GetMetadata<IAllowAnonymous>() is not null;
            foreach (var m in methods)
                probes.Add(new Probe(m, template, Fill(e.RoutePattern), anonymous));
        }
        // ما يُنهي جلسة المستدعي (إبطال الرمز) يأتي آخراً، وإلا رفضت كل الطلبات بعده بـ 401
        return probes.OrderBy(p => SessionEnding.Contains(p.Template))
            .ThenBy(p => p.Template, StringComparer.Ordinal).ThenBy(p => p.Method, StringComparer.Ordinal).ToList();
    }

    /// <summary>كل معامل مسار بقيمة لا تخص أحداً: معرّف عشوائي، أو نص ثابت.</summary>
    private static string Fill(RoutePattern pattern)
    {
        var sb = new StringBuilder();
        foreach (var segment in pattern.PathSegments)
        {
            sb.Append('/');
            foreach (var part in segment.Parts)
            {
                if (part is RoutePatternLiteralPart lit) sb.Append(lit.Content);
                else if (part is RoutePatternSeparatorPart sep) sb.Append(sep.Content);
                else if (part is RoutePatternParameterPart p)
                {
                    var constraints = p.ParameterPolicies.Select(x => x.Content ?? "").ToList();
                    sb.Append(constraints.Contains("int") || constraints.Contains("long") ? "999999"
                        : constraints.Contains("guid") || p.Name.EndsWith("Id", StringComparison.Ordinal) || p.Name == "id" ? Guid.NewGuid().ToString()
                        : "zz-unknown");
                }
            }
        }
        return sb.ToString();
    }

    private static async Task<int> Call(HttpClient client, Probe p)
    {
        using var req = new HttpRequestMessage(new HttpMethod(p.Method), p.Url);
        if (p.Method is "POST" or "PUT" or "PATCH" or "DELETE")
            req.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        req.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString());
        using var res = await client.SendAsync(req);
        return (int)res.StatusCode;
    }

    private static string Class(int status) => status is >= 200 and < 300 ? "2xx" : status.ToString(System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public async Task Every_endpoint_matches_the_approved_authorization_matrix()
    {
        var api = fx.Api;
        var identities = new (string Name, HttpClient Client)[]
        {
            ("anon", api.Client()),
            ("beneficiary", api.Client(await api.RegisterBeneficiaryAsync())),
            ("coordinator", api.Client(await api.CoordinatorAsync())),
            ("admin", api.Client(await api.AdminAsync())),
        };

        var lines = new List<string>();
        var violations = new List<string>();
        foreach (var p in Endpoints())
        {
            var cells = new List<string>();
            foreach (var (name, client) in identities)
            {
                var status = await Call(client, p);
                cells.Add($"{name}={Class(status)}");

                // ثوابت لا تحتاج الجدول: لا خطأ داخلي، والمجهول مرفوض في كل ما لم يُعلَن عاماً
                if (status >= 500) violations.Add($"{p.Method} {p.Template}: {name} → {status}");
                if (name == "anon" && !p.AllowAnonymous && status != 401) violations.Add($"{p.Method} {p.Template}: anon → {status} (expected 401)");
            }
            lines.Add($"{p.Method,-6} {p.Template}  {string.Join(' ', cells)}{(p.AllowAnonymous ? "  [public]" : "")}");
        }

        foreach (var v in violations) output.WriteLine("VIOLATION " + v);
        violations.Should().BeEmpty("every violation is listed in the test output");

        var received = string.Join('\n', lines) + "\n";
        var baseline = File.Exists(BaselinePath) ? File.ReadAllText(BaselinePath).ReplaceLineEndings("\n") : "";
        if (Environment.GetEnvironmentVariable("SANAD_UPDATE_AUTHZ_MATRIX") == "1")
        {
            File.WriteAllText(BaselinePath, received);
            return;
        }
        if (received != baseline)
        {
            var before = baseline.Split('\n').ToHashSet();
            var after = lines.ToHashSet();
            foreach (var l in lines.Where(l => !before.Contains(l))) output.WriteLine("+ " + l);
            foreach (var l in before.Where(l => l.Length > 0 && !after.Contains(l))) output.WriteLine("- " + l);
        }
        received.Should().Be(baseline,
            "the authorization matrix changed; review the +/- lines in the test output, then approve with SANAD_UPDATE_AUTHZ_MATRIX=1");
    }
}
