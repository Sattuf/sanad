using System.Diagnostics;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Sanad.Infrastructure.RateLimiting;

/// <summary>
/// حد معدل بنافذة ثابتة مشتركة بين كل نسخ الـ API عبر Redis (ADR-0020): عدّاد واحد لكل (سياسة، مفتاح، نافذة)
/// يُزاد ذرّياً بسكربت Lua، فالحد المُعلَن هو الحد الفعلي مهما كان عدد النسخ.
/// إن تعذّر الوصول لـ Redis لا تُفتح البوابة: يُطبَّق حد محلي في ذاكرة النسخة بالقيم نفسها (حماية OTP من استنزاف الرصيد).
/// </summary>
public sealed class RedisFixedWindowRateLimiter : RateLimiter
{
    // زيادة ذرّية ثم ضبط الانتهاء عند إنشاء العدّاد فقط — يُزال تلقائياً بانتهاء النافذة
    private const string Script = """
        local count = redis.call('INCRBY', KEYS[1], ARGV[2])
        if count == tonumber(ARGV[2]) then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
        return count
        """;

    private readonly IConnectionMultiplexer _redis;
    private readonly string _key;
    private readonly int _permitLimit;
    private readonly TimeSpan _window;
    private readonly RateLimiter _fallback;
    private readonly ILogger? _logger;
    private readonly TimeProvider _time;
    private long _lastUsedTimestamp;

    public RedisFixedWindowRateLimiter(IConnectionMultiplexer redis, string key, int permitLimit, TimeSpan window, ILogger? logger = null,
        TimeProvider? time = null)
    {
        _redis = redis;
        _key = key;
        _permitLimit = permitLimit;
        _window = window;
        _logger = logger;
        _time = time ?? TimeProvider.System;
        _lastUsedTimestamp = Stopwatch.GetTimestamp();
        _fallback = new FixedWindowRateLimiter(new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = window, QueueLimit = 0 });
    }

    public override TimeSpan? IdleDuration => Stopwatch.GetElapsedTime(Interlocked.Read(ref _lastUsedTimestamp));

    public override RateLimiterStatistics? GetStatistics() => null;

    /// <summary>
    /// القرار يحتاج Redis (غير متزامن)، فالمحاولة المتزامنة لا تحجز شيئاً ولا تعدّ — الوسيط ينتقل بعدها لـ AcquireAsync.
    /// </summary>
    protected override RateLimitLease AttemptAcquireCore(int permitCount) => Lease.NotDecided;

    protected override async ValueTask<RateLimitLease> AcquireAsyncCore(int permitCount, CancellationToken cancellationToken)
    {
        Interlocked.Exchange(ref _lastUsedTimestamp, Stopwatch.GetTimestamp());
        if (permitCount > _permitLimit) return Lease.Rejected(_window);

        var now = _time.GetUtcNow();
        var windowMs = (long)_window.TotalMilliseconds;
        var windowIndex = now.ToUnixTimeMilliseconds() / windowMs;
        var retryAfter = TimeSpan.FromMilliseconds((windowIndex + 1) * windowMs - now.ToUnixTimeMilliseconds());
        try
        {
            var count = (long)await _redis.GetDatabase().ScriptEvaluateAsync(Script,
                [(RedisKey)$"sanad:rl:{_key}:{windowIndex}"], [windowMs + 1000, permitCount]).WaitAsync(cancellationToken);
            return count <= _permitLimit ? Lease.Acquired : Lease.Rejected(retryAfter);
        }
        catch (Exception ex) when (ex is RedisException or TimeoutException or ObjectDisposedException)
        {
            _logger?.LogWarning(ex, "Redis rate limiter unavailable for {Key}; using per-instance fallback", _key);
            return await _fallback.AcquireAsync(permitCount, cancellationToken);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _fallback.Dispose();
        base.Dispose(disposing);
    }

    private sealed class Lease(bool acquired, TimeSpan? retryAfter) : RateLimitLease
    {
        public static readonly Lease Acquired = new(true, null);
        public static readonly Lease NotDecided = new(false, null);
        public static Lease Rejected(TimeSpan retryAfter) => new(false, retryAfter);

        public override bool IsAcquired => acquired;

        public override IEnumerable<string> MetadataNames => retryAfter is null ? [] : [MetadataName.RetryAfter.Name];

        public override bool TryGetMetadata(string metadataName, out object? metadata)
        {
            if (retryAfter is { } r && metadataName == MetadataName.RetryAfter.Name)
            {
                metadata = r;
                return true;
            }
            metadata = null;
            return false;
        }
    }
}
