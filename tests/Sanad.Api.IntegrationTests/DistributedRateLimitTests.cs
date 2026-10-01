using System.Net;
using System.Threading.RateLimiting;
using FluentAssertions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Infrastructure.RateLimiting;
using StackExchange.Redis;
using Testcontainers.Redis;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>Redis حقيقي: خادم قائم عبر SANAD_TEST_REDIS، أو Testcontainers حيث يتوفر Docker (SANAD_TEST_POSTGRES=1 في CI).</summary>
public sealed class RedisFactAttribute : FactAttribute
{
    public RedisFactAttribute()
    {
        if (RedisTestServer.Existing is null && Environment.GetEnvironmentVariable("SANAD_TEST_POSTGRES") != "1")
            Skip = "Redis غير مفعّل (SANAD_TEST_REDIS، أو SANAD_TEST_POSTGRES=1 مع Docker).";
    }
}

public sealed class RedisTestServer : IAsyncDisposable
{
    public static string? Existing => Environment.GetEnvironmentVariable("SANAD_TEST_REDIS") is { Length: > 0 } r ? r : null;

    private readonly RedisContainer? _container;

    private RedisTestServer(string connectionString, RedisContainer? container)
    {
        ConnectionString = connectionString;
        _container = container;
    }

    public string ConnectionString { get; }

    public static async Task<RedisTestServer> StartAsync()
    {
        if (Existing is { } existing)
        {
            // قاعدة منفصلة تُفرَّغ — لا تتداخل عدّادات تشغيل سابق في النافذة نفسها
            var connection = $"{existing},defaultDatabase=7,allowAdmin=true";
            await using var mux = await ConnectionMultiplexer.ConnectAsync(connection);
            foreach (var server in mux.GetServers()) await server.FlushDatabaseAsync(7);
            return new RedisTestServer(connection, null);
        }
        var container = new RedisBuilder().Build();
        await container.StartAsync();
        return new RedisTestServer(container.GetConnectionString(), container);
    }

    public async ValueTask DisposeAsync()
    {
        if (_container is not null) await _container.DisposeAsync();
    }
}

/// <summary>حدود المعدل مشتركة بين نسخ الـ API عبر Redis، ولا تُفتح البوابة إن سقط Redis (ADR-0020).</summary>
public sealed class DistributedRateLimitTests
{
    private sealed class ManualClock(DateTimeOffset start) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = start;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    [RedisFact]
    public async Task Two_instances_share_one_counter_and_the_window_rolls_over()
    {
        await using var server = await RedisTestServer.StartAsync();
        await using var mux = await ConnectionMultiplexer.ConnectAsync(server.ConnectionString);
        var clock = new ManualClock(new DateTimeOffset(2026, 10, 1, 12, 0, 5, TimeSpan.Zero));
        var key = $"otp:{Guid.NewGuid():N}";
        // نسختان من الـ API = مُحدِّدان مستقلان على المفتاح نفسه
        using var nodeA = new RedisFixedWindowRateLimiter(mux, key, 3, TimeSpan.FromMinutes(1), time: clock);
        using var nodeB = new RedisFixedWindowRateLimiter(mux, key, 3, TimeSpan.FromMinutes(1), time: clock);

        (await nodeA.AcquireAsync()).IsAcquired.Should().BeTrue();
        (await nodeB.AcquireAsync()).IsAcquired.Should().BeTrue();
        (await nodeA.AcquireAsync()).IsAcquired.Should().BeTrue();
        using var rejected = await nodeB.AcquireAsync();
        rejected.IsAcquired.Should().BeFalse("الحد 3 للنسخ معاً لا لكل نسخة");
        rejected.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter).Should().BeTrue();
        retryAfter.Should().Be(TimeSpan.FromSeconds(55));

        clock.Now = clock.Now.AddMinutes(1);
        (await nodeB.AcquireAsync()).IsAcquired.Should().BeTrue("نافذة جديدة");
    }

    [RedisFact]
    public async Task Synchronous_attempt_never_consumes_a_permit()
    {
        await using var server = await RedisTestServer.StartAsync();
        await using var mux = await ConnectionMultiplexer.ConnectAsync(server.ConnectionString);
        using var limiter = new RedisFixedWindowRateLimiter(mux, $"auth:{Guid.NewGuid():N}", 1, TimeSpan.FromMinutes(1));
        for (var i = 0; i < 5; i++) limiter.AttemptAcquire().IsAcquired.Should().BeFalse();
        (await limiter.AcquireAsync()).IsAcquired.Should().BeTrue();
        (await limiter.AcquireAsync()).IsAcquired.Should().BeFalse();
    }

    [Fact]
    public async Task Unreachable_redis_falls_back_to_a_local_limit_instead_of_allowing_everything()
    {
        await using var mux = await ConnectionMultiplexer.ConnectAsync("127.0.0.1:1,abortConnect=false,connectTimeout=200,asyncTimeout=200,syncTimeout=200");
        using var limiter = new RedisFixedWindowRateLimiter(mux, "otp:down", 2, TimeSpan.FromMinutes(1));
        (await limiter.AcquireAsync()).IsAcquired.Should().BeTrue();
        (await limiter.AcquireAsync()).IsAcquired.Should().BeTrue();
        (await limiter.AcquireAsync()).IsAcquired.Should().BeFalse("حماية رصيد SMS تبقى حتى مع سقوط Redis");
    }

    [Fact]
    public void Redis_keys_carry_a_fingerprint_not_the_ip_or_user_id()
    {
        var fingerprint = RateLimitPartitions.Fingerprint("203.0.113.7");
        fingerprint.Should().HaveLength(24).And.NotContain("203");
        RateLimitPartitions.Fingerprint("203.0.113.7").Should().Be(fingerprint);
    }

    [RedisFact]
    public async Task Otp_limit_holds_across_two_api_nodes_sharing_redis()
    {
        await using var server = await RedisTestServer.StartAsync();
        var settings = new Dictionary<string, string>
        {
            ["ConnectionStrings:Redis"] = server.ConnectionString,
            ["RateLimiting:OtpRequestsPerMinute"] = "2",
        };
        using var nodeA = new SanadApiFactory(extraSettings: settings);
        using var nodeB = new SanadApiFactory(extraSettings: settings);
        HttpResponseMessage Send(SanadApiFactory node) =>
            new TestApi(node).Client().PostAsync("/api/v1/auth/phone/request-otp", Body(new { phoneNumber = "+966512345678" })).GetAwaiter().GetResult();

        Send(nodeA).StatusCode.Should().Be(HttpStatusCode.Accepted);
        Send(nodeB).StatusCode.Should().Be(HttpStatusCode.Accepted);
        var third = Send(nodeA);
        third.StatusCode.Should().Be(HttpStatusCode.TooManyRequests, "الحد 2 في الدقيقة لكل النسخ معاً");
        (await ReadJson(third))["code"]!.GetValue<string>().Should().Be("rate_limited");
        Send(nodeB).StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }
}
