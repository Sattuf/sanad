using System.Collections;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Api.IntegrationTests.Infrastructure;
using Xunit.Abstractions;

namespace Sanad.Api.IntegrationTests.Security;

/// <summary>مضيف مستقل: الضبابية ترسل آلاف الطلبات المشوَّهة، فلا تشارك قاعدة بقية الاختبارات.</summary>
public sealed class FuzzFixture : IDisposable
{
    public FuzzFixture()
    {
        Factory = new SanadApiFactory(extraSettings: new Dictionary<string, string>
        {
            // كل الطلبات من عميل واحد: حدود المعدّل تُختبر في ApiHardeningTests لا هنا
            ["RateLimiting:GlobalPerMinute"] = "1000000",
            ["RateLimiting:AuthPerMinute"] = "1000000",
            ["RateLimiting:OtpRequestsPerMinute"] = "1000000",
            ["RateLimiting:OtpVerifyPerMinute"] = "1000000",
            ["RateLimiting:ShareLinksPerHour"] = "1000000",
            ["RateLimiting:UploadsPerHour"] = "1000000",
            ["RateLimiting:KhatmaInvitesPerHour"] = "1000000",
            ["RateLimiting:MessagesPerMinute"] = "1000000",
            ["RateLimiting:PublicPerMinute"] = "1000000",
            ["RateLimiting:MediaPerMinute"] = "1000000",
        });
        Api = new TestApi(Factory);
    }

    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();
}

/// <summary>
/// ضبابية الـ API (fuzzing): لكل نقطة نهاية يكتشفها التطبيق، أجسام تُبنى من نوع طلبها ثم تُشوَّه
/// (أنواع خاطئة، حدود الأرقام، نصوص ضخمة أو خبيثة، JSON مكسور أو عميق)، ومعاملات مسار غريبة،
/// بهوية مجهولة ومستفيد ومدير. الثابت الوحيد: لا 5xx — كل مدخل سيئ يُرفض بـ 4xx.
/// البذرة ثابتة فالفشل يتكرر؛ SANAD_FUZZ_SEED وSANAD_FUZZ_CASES لتجربة أوسع محلياً.
/// </summary>
public sealed class ApiFuzzTests(FuzzFixture fx, ITestOutputHelper output) : IClassFixture<FuzzFixture>
{
    private static readonly int Seed = int.TryParse(Environment.GetEnvironmentVariable("SANAD_FUZZ_SEED"), out var s) ? s : 20261023;
    private static readonly int Cases = int.TryParse(Environment.GetEnvironmentVariable("SANAD_FUZZ_CASES"), out var c) ? c : 12;

    // ما يُنهي جلسة المستدعي يأتي آخراً، وإلا رُفض كل ما بعده بـ 401 فلا يصل التشويه إلى المعالِج
    private static readonly HashSet<string> SessionEnding = ["/api/v1/auth/revoke", "/api/v1/me"];

    private sealed record Target(string Method, RoutePattern Route, Type? Body, string Template);

    private IReadOnlyList<Target> Targets() =>
        fx.Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>()
            .Where(e => !(e.RoutePattern.RawText ?? "").TrimStart('/').StartsWith("hubs/", StringComparison.Ordinal))
            .SelectMany(e => (e.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? []).Select(m =>
                new Target(m, e.RoutePattern, e.Metadata.GetMetadata<IAcceptsMetadata>()?.RequestType, "/" + (e.RoutePattern.RawText ?? "").TrimStart('/'))))
            .OrderBy(t => SessionEnding.Contains(t.Template) && t.Method is "DELETE" or "POST")
            .ThenBy(t => t.Template, StringComparer.Ordinal).ThenBy(t => t.Method, StringComparer.Ordinal)
            .ToList();

    [Fact]
    public async Task No_malformed_request_makes_the_api_fail_with_5xx()
    {
        var api = fx.Api;
        var identities = new (string Name, HttpClient Client)[]
        {
            ("anon", api.Client()),
            ("beneficiary", api.Client(await api.RegisterBeneficiaryAsync())),
            ("admin", api.Client(await api.AdminAsync())),
        };

        var random = new Random(Seed);
        var failures = new List<string>();
        var sent = 0;
        foreach (var target in Targets())
        {
            foreach (var (name, client) in identities)
            {
                for (var i = 0; i < Cases; i++)
                {
                    var url = FillRoute(target.Route, random, mangle: i % 3 == 2);
                    var (body, contentType) = target.Method is "GET" or "HEAD" ? (null, null) : MakeBody(target.Body, random, i);
                    using var req = new HttpRequestMessage(new HttpMethod(target.Method), url);
                    if (body is not null) req.Content = new StringContent(body, Encoding.UTF8, contentType!);
                    req.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString());

                    HttpStatusCode status;
                    try
                    {
                        using var res = await client.SendAsync(req);
                        status = res.StatusCode;
                    }
                    catch (Exception ex) when (ex is not OutOfMemoryException)
                    {
                        // TestServer ينقل الاستثناء غير المعالَج إلى العميل: هو 500 أيضاً
                        failures.Add($"{target.Method} {url} as {name} → threw {ex.GetType().Name}: {ex.Message}\n    body: {Clip(body)}");
                        continue;
                    }
                    sent++;
                    if ((int)status >= 500)
                        failures.Add($"{target.Method} {url} as {name} → {(int)status}\n    body: {Clip(body)}");
                }
            }
        }

        output.WriteLine($"seed {Seed}, {Cases} cases per endpoint and identity, {sent} requests");
        foreach (var f in failures.Distinct().Take(60)) output.WriteLine("FAIL " + f);
        failures.Should().BeEmpty($"{failures.Count} malformed requests got a 5xx (seed {Seed}); they are listed in the test output");
    }

    private static string Clip(string? body) => body is null ? "(none)" : body.Length > 300 ? body[..300] + $"… ({body.Length} chars)" : body;

    // ── المسار ───────────────────────────────────────────────────────────────

    // بلا %00 في المسار: عميل TestServer يرفض بناء الطلب نفسه، وKestrel الحقيقي يرده بـ 400 قبل التطبيق (يبقى في الاستعلام)
    private static readonly string[] WeirdSegments =
        ["0", "-1", "99999999999999999999", "00000000-0000-0000-0000-000000000000", "%2e%2e", "' OR 1=1--", "%F0%9F%98%80", new string('a', 2000), "null"];

    private static string FillRoute(RoutePattern pattern, Random random, bool mangle)
    {
        var sb = new StringBuilder();
        foreach (var segment in pattern.PathSegments)
        {
            sb.Append('/');
            foreach (var part in segment.Parts)
            {
                switch (part)
                {
                    case RoutePatternLiteralPart lit: sb.Append(lit.Content); break;
                    case RoutePatternSeparatorPart sep: sb.Append(sep.Content); break;
                    case RoutePatternParameterPart p:
                        var constraints = p.ParameterPolicies.Select(x => x.Content ?? "").ToList();
                        sb.Append(mangle ? WeirdSegments[random.Next(WeirdSegments.Length)]
                            : constraints.Contains("int") || constraints.Contains("long") ? random.Next(-5, 1_000_000).ToString(System.Globalization.CultureInfo.InvariantCulture)
                            : constraints.Contains("guid") || p.Name.EndsWith("Id", StringComparison.Ordinal) || p.Name == "id" ? Guid.NewGuid().ToString()
                            : "zz-unknown");
                        break;
                }
            }
        }
        // معاملات استعلام عشوائية فوق ما يتوقعه المعالج
        if (mangle) sb.Append("?page=-1&pageSize=99999999&q=%27%22%3C&sort=%00&from=not-a-date");
        return sb.ToString();
    }

    // ── الجسم ────────────────────────────────────────────────────────────────

    private static readonly string[] RawBodies =
    [
        "", "{", "[]", "null", "\"text\"", "123", "{\"a\":", "{}{}",
        new string('[', 5000) + new string(']', 5000),
        "{" + string.Concat(Enumerable.Repeat("\"a\":{", 200)) + "}" + new string('}', 200),
    ];

    private static (string Body, string ContentType) MakeBody(Type? type, Random random, int caseIndex)
    {
        // ثلث الحالات JSON مكسور أو بنوع محتوى خاطئ، والبقية جسم من نوع الطلب بقيم مشوّهة
        if (caseIndex % 3 == 0)
            return random.Next(4) == 0
                ? ("email=x&password=y", "application/x-www-form-urlencoded")
                : (RawBodies[random.Next(RawBodies.Length)], "application/json");
        var node = type is null ? new JsonObject { ["unexpected"] = Junk(random) } : Generate(type, random, depth: 0);
        return (node?.ToJsonString() ?? "null", "application/json");
    }

    private static JsonNode? Generate(Type type, Random random, int depth)
    {
        // واحد من خمسة: قيمة من نوع خاطئ تماماً بدل القيمة الصحيحة
        if (depth > 0 && random.Next(5) == 0) return Junk(random);

        var t = Nullable.GetUnderlyingType(type) ?? type;
        // النصوص الضخمة في المستويين الأولين فقط، وإلا تضاعفت داخل المصفوفات إلى غيغابايتات
        if (t == typeof(string)) return depth <= 1 ? Pick(random, StringValues) : Pick(random, StringValues.Where(v => v.Length < 100).ToList());
        if (t == typeof(bool)) return random.Next(2) == 0;
        if (t == typeof(Guid)) return random.Next(3) == 0 ? Guid.Empty.ToString() : Guid.NewGuid().ToString();
        if (t == typeof(DateTime) || t == typeof(DateTimeOffset)) return Pick(random, DateValues);
        if (t == typeof(DateOnly)) return Pick(random, ["0001-01-01", "9999-12-31", "2026-02-30", "2026-10-23"]);
        if (t == typeof(TimeOnly) || t == typeof(TimeSpan)) return Pick(random, ["00:00", "23:59:59", "25:61", "-1"]);
        if (t.IsEnum) return random.Next(3) == 0 ? JsonValue.Create(999) : Pick(random, [.. Enum.GetNames(t), "NotAValue", ""]);
        if (t == typeof(int) || t == typeof(long) || t == typeof(short) || t == typeof(byte))
            return JsonValue.Create(Pick(random, [0L, -1L, 1L, int.MaxValue, int.MinValue, long.MaxValue, 999_999_999L]));
        if (t == typeof(double) || t == typeof(decimal) || t == typeof(float))
            return JsonValue.Create(Pick(random, [0d, -1d, 1e308, -1e308, 0.1, double.Epsilon]));
        if (depth > 4) return null;
        if (t != typeof(string) && typeof(IEnumerable).IsAssignableFrom(t))
        {
            var element = t.IsArray ? t.GetElementType()! : t.GetGenericArguments().LastOrDefault() ?? typeof(string);
            // مصفوفة طويلة (500) في المستوى الأول فقط؛ أعمق منها عناصر قليلة
            var count = depth <= 1 ? Pick(random, [0, 1, 3, 500]) : Pick(random, [0, 1, 2]);
            var array = new JsonArray();
            for (var i = 0; i < count; i++) array.Add(Generate(element, random, depth + 1));
            return array;
        }

        var obj = new JsonObject();
        foreach (var prop in t.GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.GetIndexParameters().Length == 0))
        {
            if (random.Next(8) == 0) continue; // حقل مطلوب ناقص
            obj[JsonNamingPolicy.CamelCase.ConvertName(prop.Name)] = Generate(prop.PropertyType, random, depth + 1);
        }
        if (random.Next(4) == 0) obj["__proto__"] = new JsonObject { ["isAdmin"] = true }; // حقل زائد
        return obj;
    }

    private static readonly string[] StringValues =
    [
        "", " ", "a", new string('x', 10_000), new string('ب', 100_000),
        "\u0000", "‮معكوس", "😀👨‍👩‍👧", "' OR '1'='1", "\"; DROP TABLE users;--", "<script>alert(1)</script>",
        "../../etc/passwd", "${jndi:ldap://x}", "%s%s%s%n", "not-an-email@", "+9665000000000000000", "\r\nX-Injected: 1",
    ];

    private static readonly string[] DateValues =
        ["0001-01-01T00:00:00Z", "9999-12-31T23:59:59Z", "2026-13-45T99:99:99Z", "yesterday", "", "1970-01-01T00:00:00+14:00"];

    private static JsonNode? Junk(Random random) => random.Next(7) switch
    {
        0 => null,
        1 => JsonValue.Create(-1),
        2 => JsonValue.Create("😀"),
        3 => new JsonArray(1, "two", null),
        4 => new JsonObject { ["nested"] = new JsonObject { ["deep"] = true } },
        5 => JsonValue.Create(true),
        _ => JsonValue.Create(1e308),
    };

    private static T Pick<T>(Random random, IReadOnlyList<T> values) => values[random.Next(values.Count)];
}
